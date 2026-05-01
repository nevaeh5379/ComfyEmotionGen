"""
SQLite 기반 잡 영속 저장소.

백엔드 재시작 시에도 잡 목록을 유지하기 위해 사용.
잡 상태 전환 audit log와 ComfyUI 실행 이벤트 로그도 함께 저장.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Optional

import aiosqlite

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path("jobs.db")


class JobStore:
    """aiosqlite 기반 잡 저장소."""

    def __init__(self, db_path: Path = DEFAULT_DB_PATH) -> None:
        self._db_path = db_path
        self._conn: Optional[aiosqlite.Connection] = None

    async def open(self) -> None:
        self._conn = await aiosqlite.connect(str(self._db_path))
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                prompt TEXT NOT NULL,
                workflow_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                worker_id TEXT,
                error TEXT,
                image_urls_json TEXT NOT NULL DEFAULT '[]',
                progress_percent REAL NOT NULL DEFAULT 0.0,
                current_node_name TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL,
                started_at REAL,
                finished_at REAL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                execution_duration_ms REAL
            )
            """
        )
        # execution_duration_ms 컬럼이 없는 기존 DB를 위한 마이그레이션
        await self._migrate_add_column("jobs", "execution_duration_ms", "REAL")

        await self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS job_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                timestamp REAL NOT NULL,
                worker_id TEXT,
                details TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id)"
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_job_events_timestamp ON job_events(timestamp)"
        )

        await self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS execution_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                worker_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                timestamp REAL NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_execution_events_job_id ON execution_events(job_id)"
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_execution_events_timestamp ON execution_events(timestamp)"
        )

        await self._conn.commit()

    async def _migrate_add_column(
        self, table: str, column: str, col_type: str
    ) -> None:
        """컬럼이 없으면 ALTER TABLE로 추가."""
        assert self._conn is not None
        cursor = await self._conn.execute(f"PRAGMA table_info({table})")
        rows = await cursor.fetchall()
        existing = {row["name"] for row in rows}
        if column not in existing:
            await self._conn.execute(
                f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
            )
            logger.info("migrated: added %s.%s (%s)", table, column, col_type)

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def save(self, job_dict: dict[str, Any]) -> None:
        assert self._conn is not None
        await self._conn.execute(
            """
            INSERT OR REPLACE INTO jobs (
                id, filename, prompt, workflow_json, status, worker_id,
                error, image_urls_json, progress_percent, current_node_name,
                created_at, started_at, finished_at, retry_count,
                execution_duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_dict["id"],
                job_dict["filename"],
                job_dict["prompt"],
                json.dumps(job_dict.get("_workflow", {})),
                job_dict["status"],
                job_dict.get("workerId"),
                job_dict.get("error"),
                json.dumps(job_dict.get("imageUrls", [])),
                job_dict.get("progressPercent", 0.0),
                job_dict.get("currentNodeName", ""),
                job_dict.get("createdAt", 0.0),
                job_dict.get("startedAt"),
                job_dict.get("finishedAt"),
                job_dict.get("retryCount", 0),
                job_dict.get("executionDurationMs"),
            ),
        )
        await self._conn.commit()

    async def delete(self, job_id: str) -> None:
        assert self._conn is not None
        await self._conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        await self._conn.commit()

    async def load_all(self) -> list[dict[str, Any]]:
        assert self._conn is not None
        cursor = await self._conn.execute("SELECT * FROM jobs ORDER BY created_at ASC")
        rows = await cursor.fetchall()
        results: list[dict[str, Any]] = []
        for row in rows:
            results.append(
                {
                    "id": row["id"],
                    "filename": row["filename"],
                    "prompt": row["prompt"],
                    "_workflow": json.loads(row["workflow_json"]),
                    "status": row["status"],
                    "workerId": row["worker_id"],
                    "error": row["error"],
                    "imageUrls": json.loads(row["image_urls_json"]),
                    "progressPercent": row["progress_percent"],
                    "currentNodeName": row["current_node_name"],
                    "createdAt": row["created_at"],
                    "startedAt": row["started_at"],
                    "finishedAt": row["finished_at"],
                    "retryCount": row["retry_count"],
                    "executionDurationMs": row["execution_duration_ms"],
                }
            )
        return results

    # ---------- job_events (audit log) ----------

    async def save_event(
        self,
        job_id: str,
        event_type: str,
        *,
        worker_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """잡 상태 전환 이벤트를 기록 (INSERT-only)."""
        assert self._conn is not None
        await self._conn.execute(
            """
            INSERT INTO job_events (job_id, event_type, timestamp, worker_id, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                job_id,
                event_type,
                time.time(),
                worker_id,
                json.dumps(details or {}),
            ),
        )
        await self._conn.commit()

    async def get_job_events(self, job_id: str) -> list[dict[str, Any]]:
        """특정 잡의 모든 상태 전환 이력을 시간순으로 반환."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT * FROM job_events WHERE job_id = ? ORDER BY timestamp ASC",
            (job_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row["id"],
                "jobId": row["job_id"],
                "eventType": row["event_type"],
                "timestamp": row["timestamp"],
                "workerId": row["worker_id"],
                "details": json.loads(row["details"]),
            }
            for row in rows
        ]

    # ---------- execution_events (ComfyUI raw events) ----------

    async def save_execution_event(
        self,
        job_id: str,
        worker_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """ComfyUI 실행 이벤트를 기록 (INSERT-only)."""
        assert self._conn is not None
        await self._conn.execute(
            """
            INSERT INTO execution_events (job_id, worker_id, event_type, timestamp, payload_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                job_id,
                worker_id,
                event_type,
                time.time(),
                json.dumps(payload),
            ),
        )
        await self._conn.commit()

    async def get_execution_events(self, job_id: str) -> list[dict[str, Any]]:
        """특정 잡의 모든 ComfyUI 실행 이벤트를 시간순으로 반환."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT * FROM execution_events WHERE job_id = ? ORDER BY timestamp ASC",
            (job_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row["id"],
                "jobId": row["job_id"],
                "workerId": row["worker_id"],
                "eventType": row["event_type"],
                "timestamp": row["timestamp"],
                "payload": json.loads(row["payload_json"]),
            }
            for row in rows
        ]

    # ---------- 통합 로그 조회 ----------

    async def get_all_events(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None,
        worker_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """필터링된 전체 job_events 목록을 반환."""
        assert self._conn is not None
        conditions: list[str] = []
        params: list[Any] = []

        if status is not None:
            # status는 jobs 테이블에 있으므로 JOIN 필요
            pass  # 아래에서 처리
        if worker_id is not None:
            conditions.append("je.worker_id = ?")
            params.append(worker_id)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        if status is not None:
            query = f"""
                SELECT je.* FROM job_events je
                JOIN jobs j ON je.job_id = j.id
                {where_clause}
                {'AND' if conditions else 'WHERE'} j.status = ?
                ORDER BY je.timestamp DESC
                LIMIT ? OFFSET ?
            """
            params.extend([status, limit, offset])
        else:
            query = f"""
                SELECT * FROM job_events je
                {where_clause}
                ORDER BY je.timestamp DESC
                LIMIT ? OFFSET ?
            """
            params.extend([limit, offset])

        cursor = await self._conn.execute(query, params)
        rows = await cursor.fetchall()
        return [
            {
                "id": row["id"],
                "jobId": row["job_id"],
                "eventType": row["event_type"],
                "timestamp": row["timestamp"],
                "workerId": row["worker_id"],
                "details": json.loads(row["details"]),
            }
            for row in rows
        ]
