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


def _saved_image_row_to_dict(
    row: Any, *, tags: Optional[list[str]] = None
) -> dict[str, Any]:
    keys = row.keys() if hasattr(row, "keys") else set()
    return {
        "hash": row["hash"],
        "jobId": row["job_id"],
        "originalFilename": row["original_filename"],
        "comfyFilename": row["comfy_filename"],
        "subfolder": row["subfolder"],
        "type": row["type"],
        "workerId": row["worker_id"],
        "extension": row["extension"],
        "sizeBytes": row["size_bytes"],
        "prompt": row["prompt"],
        "createdAt": row["created_at"],
        "status": row["status"] if "status" in keys else "pending",
        "note": row["note"] if "note" in keys else "",
        "trashedAt": row["trashed_at"] if "trashed_at" in keys else None,
        "tags": tags or [],
    }


class JobStore:
    """aiosqlite 기반 잡 저장소."""

    def __init__(self, db_path: Path = DEFAULT_DB_PATH) -> None:
        self._db_path = db_path
        self._conn: Optional[aiosqlite.Connection] = None

    async def open(self) -> None:
        if self._conn is not None:
            return
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

        await self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_images (
                hash TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                original_filename TEXT NOT NULL DEFAULT '',
                comfy_filename TEXT NOT NULL DEFAULT '',
                subfolder TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL DEFAULT '',
                worker_id TEXT,
                extension TEXT NOT NULL DEFAULT '',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                prompt TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL
            )
            """
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_saved_images_job_id ON saved_images(job_id)"
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_saved_images_created_at ON saved_images(created_at)"
        )
        # 큐레이션 컬럼 마이그레이션 (NOT NULL DEFAULT는 ALTER로 추가 가능)
        await self._migrate_add_column(
            "saved_images", "status", "TEXT NOT NULL DEFAULT 'pending'"
        )
        await self._migrate_add_column(
            "saved_images", "note", "TEXT NOT NULL DEFAULT ''"
        )
        await self._migrate_add_column("saved_images", "trashed_at", "REAL")
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_saved_images_status ON saved_images(status)"
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_saved_images_original_filename "
            "ON saved_images(original_filename)"
        )

        await self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS image_tags (
                image_hash TEXT NOT NULL,
                tag TEXT NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY (image_hash, tag)
            )
            """
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag)"
        )

        await self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workers (
                url TEXT PRIMARY KEY,
                added_at REAL NOT NULL
            )
            """
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

    # ---------- workers (persistent ComfyUI URL list) ----------

    async def list_worker_urls(self) -> list[str]:
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT url FROM workers ORDER BY added_at ASC"
        )
        rows = await cursor.fetchall()
        return [row["url"] for row in rows]

    async def add_worker_url(self, url: str) -> bool:
        """URL 추가. 이미 존재하면 False, 새로 추가했으면 True."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "INSERT OR IGNORE INTO workers (url, added_at) VALUES (?, ?)",
            (url, time.time()),
        )
        await self._conn.commit()
        return cursor.rowcount > 0

    async def remove_worker_url(self, url: str) -> bool:
        assert self._conn is not None
        cursor = await self._conn.execute(
            "DELETE FROM workers WHERE url = ?", (url,)
        )
        await self._conn.commit()
        return cursor.rowcount > 0

    # ---------- saved_images ----------

    async def save_image_record(
        self,
        *,
        hash: str,
        job_id: str,
        original_filename: str,
        comfy_filename: str,
        subfolder: str,
        type_: str,
        worker_id: Optional[str],
        extension: str,
        size_bytes: int,
        prompt: str,
    ) -> None:
        assert self._conn is not None
        await self._conn.execute(
            """
            INSERT OR IGNORE INTO saved_images (
                hash, job_id, original_filename, comfy_filename,
                subfolder, type, worker_id, extension, size_bytes,
                prompt, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hash,
                job_id,
                original_filename,
                comfy_filename,
                subfolder,
                type_,
                worker_id,
                extension,
                size_bytes,
                prompt,
                time.time(),
            ),
        )
        await self._conn.commit()

    async def get_saved_image(self, hash: str) -> Optional[dict[str, Any]]:
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT * FROM saved_images WHERE hash = ?", (hash,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        tags = await self.get_tags(hash)
        return _saved_image_row_to_dict(row, tags=tags)

    def _saved_images_filter_clause(
        self,
        *,
        job_id: Optional[str] = None,
        status: Optional[str] = None,
        filename: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> tuple[str, str, list[Any]]:
        """list/count가 공유하는 JOIN/WHERE/params 빌더."""
        conditions: list[str] = []
        params: list[Any] = []
        joins = ""
        if tag is not None:
            joins = " JOIN image_tags it ON it.image_hash = si.hash"
            conditions.append("it.tag = ?")
            params.append(tag)
        if job_id is not None:
            conditions.append("si.job_id = ?")
            params.append(job_id)
        if status is not None:
            conditions.append("si.status = ?")
            params.append(status)
        if filename is not None:
            conditions.append("si.original_filename = ?")
            params.append(filename)
        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        return joins, where, params

    async def count_saved_images(
        self,
        *,
        job_id: Optional[str] = None,
        status: Optional[str] = None,
        filename: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> int:
        assert self._conn is not None
        joins, where, params = self._saved_images_filter_clause(
            job_id=job_id, status=status, filename=filename, tag=tag
        )
        query = f"SELECT COUNT(*) AS c FROM saved_images si{joins}{where}"
        cursor = await self._conn.execute(query, params)
        row = await cursor.fetchone()
        return int(row["c"]) if row is not None else 0

    async def list_saved_images(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        job_id: Optional[str] = None,
        status: Optional[str] = None,
        filename: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        assert self._conn is not None
        joins, where, params = self._saved_images_filter_clause(
            job_id=job_id, status=status, filename=filename, tag=tag
        )
        query = (
            f"SELECT si.* FROM saved_images si{joins}{where} "
            "ORDER BY si.created_at DESC LIMIT ? OFFSET ?"
        )
        params.extend([limit, offset])
        cursor = await self._conn.execute(query, params)
        rows = await cursor.fetchall()
        if not rows:
            return []
        # 태그 일괄 조회 (N+1 방지)
        hashes = [r["hash"] for r in rows]
        placeholders = ",".join("?" * len(hashes))
        tag_cursor = await self._conn.execute(
            f"SELECT image_hash, tag FROM image_tags "
            f"WHERE image_hash IN ({placeholders}) ORDER BY tag ASC",
            hashes,
        )
        tag_map: dict[str, list[str]] = {h: [] for h in hashes}
        for tag_row in await tag_cursor.fetchall():
            tag_map[tag_row["image_hash"]].append(tag_row["tag"])
        return [_saved_image_row_to_dict(r, tags=tag_map.get(r["hash"], [])) for r in rows]

    # ---------- 큐레이션 ----------

    async def update_curation(
        self,
        hash: str,
        *,
        status: Optional[str] = None,
        note: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """status/note 부분 업데이트. status='trashed'면 trashed_at 동기화."""
        assert self._conn is not None
        existing = await self.get_saved_image(hash)
        if existing is None:
            return None
        sets: list[str] = []
        params: list[Any] = []
        if status is not None:
            sets.append("status = ?")
            params.append(status)
            if status == "trashed":
                sets.append("trashed_at = ?")
                params.append(time.time())
            else:
                sets.append("trashed_at = NULL")
        if note is not None:
            sets.append("note = ?")
            params.append(note)
        if not sets:
            return existing
        params.append(hash)
        await self._conn.execute(
            f"UPDATE saved_images SET {', '.join(sets)} WHERE hash = ?", params
        )
        await self._conn.commit()
        return await self.get_saved_image(hash)

    async def delete_saved_image(self, hash: str) -> bool:
        """saved_images 행 + 태그 영구 삭제. 디스크 파일은 호출자가 삭제."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "DELETE FROM saved_images WHERE hash = ?", (hash,)
        )
        await self._conn.execute(
            "DELETE FROM image_tags WHERE image_hash = ?", (hash,)
        )
        await self._conn.commit()
        return cursor.rowcount > 0

    async def list_trashed_for_purge(self) -> list[dict[str, Any]]:
        """status='trashed' 항목 전체 (휴지통 비우기에서 디스크 정리에 필요)."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT hash, extension FROM saved_images WHERE status = 'trashed'"
        )
        rows = await cursor.fetchall()
        return [{"hash": r["hash"], "extension": r["extension"]} for r in rows]

    # ---------- 태그 ----------

    async def add_tags(self, hash: str, tags: list[str]) -> list[str]:
        assert self._conn is not None
        now = time.time()
        for tag in tags:
            t = tag.strip()
            if not t:
                continue
            await self._conn.execute(
                "INSERT OR IGNORE INTO image_tags (image_hash, tag, created_at) "
                "VALUES (?, ?, ?)",
                (hash, t, now),
            )
        await self._conn.commit()
        return await self.get_tags(hash)

    async def remove_tag(self, hash: str, tag: str) -> list[str]:
        assert self._conn is not None
        await self._conn.execute(
            "DELETE FROM image_tags WHERE image_hash = ? AND tag = ?",
            (hash, tag),
        )
        await self._conn.commit()
        return await self.get_tags(hash)

    async def get_tags(self, hash: str) -> list[str]:
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT tag FROM image_tags WHERE image_hash = ? ORDER BY tag ASC",
            (hash,),
        )
        rows = await cursor.fetchall()
        return [r["tag"] for r in rows]

    async def list_tag_counts(self) -> list[dict[str, Any]]:
        """{tag, count} 리스트 (count 내림차순)."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT tag, COUNT(*) AS cnt FROM image_tags "
            "GROUP BY tag ORDER BY cnt DESC, tag ASC"
        )
        rows = await cursor.fetchall()
        return [{"tag": r["tag"], "count": r["cnt"]} for r in rows]

    # ---------- asset groups (filename 단위 집계) ----------

    async def list_asset_groups(
        self, *, limit: int = 100, offset: int = 0, sort: str = "latest"
    ) -> list[dict[str, Any]]:
        assert self._conn is not None
        if sort == "name":
            order = "filename ASC"
        elif sort == "count":
            order = "total DESC, filename ASC"
        else:
            order = "latestCreatedAt DESC"
        cursor = await self._conn.execute(
            f"""
            SELECT
              original_filename AS filename,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pendingCount,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approvedCount,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejectedCount,
              SUM(CASE WHEN status = 'trashed'  THEN 1 ELSE 0 END) AS trashedCount,
              MAX(created_at) AS latestCreatedAt,
              (
                SELECT hash FROM saved_images si2
                WHERE si2.original_filename = si.original_filename
                ORDER BY si2.created_at DESC LIMIT 1
              ) AS sampleHash
            FROM saved_images si
            GROUP BY original_filename
            ORDER BY {order}
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = await cursor.fetchall()
        return [
            {
                "filename": r["filename"],
                "total": r["total"],
                "pendingCount": r["pendingCount"] or 0,
                "approvedCount": r["approvedCount"] or 0,
                "rejectedCount": r["rejectedCount"] or 0,
                "trashedCount": r["trashedCount"] or 0,
                "latestCreatedAt": r["latestCreatedAt"],
                "sampleHash": r["sampleHash"],
            }
            for r in rows
        ]

    async def get_latest_job_by_filename(
        self, filename: str
    ) -> Optional[dict[str, Any]]:
        """같은 filename으로 등록된 가장 최근 Job (워크플로우 재사용용)."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT * FROM jobs WHERE filename = ? ORDER BY created_at DESC LIMIT 1",
            (filename,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "filename": row["filename"],
            "prompt": row["prompt"],
            "_workflow": json.loads(row["workflow_json"]),
        }

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
