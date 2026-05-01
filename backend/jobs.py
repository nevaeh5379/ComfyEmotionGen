"""
잡 모델 + 인메모리 저장소 + 멀티 워커 디스패처.

상태 머신:
    pending  → 워커에 아직 배정 안 됨
    queued   → 워커에 POST 완료, execution_start 대기
    running  → execution_start 수신
    done     → execution_success 수신
    error    → 워커 죽음 / HTTP 실패 / interrupted
    cancelled→ 사용자 취소

스케줄링:
    워커 풀에 idle 워커가 있고 pending 잡이 있으면 즉시 매칭.
    워커별 직렬 (현재는 워커 1개당 잡 1개), 워커 간 병렬.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal, Optional

from comfy_client import ComfyWorker
from job_store import JobStore
from worker_pool import WorkerPool

logger = logging.getLogger(__name__)


JobStatus = Literal[
    "pending", "queued", "running", "done", "error", "cancelled"
]


RETRY_DELAY = 1.0  # 재시도 간격 (초)
DEFAULT_IMAGES_DIR = Path("images")


@dataclass
class Job:
    id: str
    filename: str
    prompt: str
    workflow: dict[str, Any]
    status: JobStatus = "pending"
    worker_id: Optional[str] = None
    error: Optional[str] = None
    image_urls: list[str] = field(default_factory=list)
    progress_percent: float = 0.0
    current_node_name: str = ""
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    retry_count: int = 0
    execution_duration_ms: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "prompt": self.prompt,
            "_workflow": self.workflow,
            "status": self.status,
            "workerId": self.worker_id,
            "error": self.error,
            "imageUrls": self.image_urls,
            "progressPercent": self.progress_percent,
            "currentNodeName": self.current_node_name,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "retryCount": self.retry_count,
            "executionDurationMs": self.execution_duration_ms,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Job:
        return cls(
            id=d["id"],
            filename=d["filename"],
            prompt=d["prompt"],
            workflow=d.get("_workflow", {}),
            status=d.get("status", "pending"),
            worker_id=d.get("workerId"),
            error=d.get("error"),
            image_urls=d.get("imageUrls", []),
            progress_percent=d.get("progressPercent", 0.0),
            current_node_name=d.get("currentNodeName", ""),
            created_at=d.get("createdAt", time.time()),
            started_at=d.get("startedAt"),
            finished_at=d.get("finishedAt"),
            retry_count=d.get("retryCount", 0),
            execution_duration_ms=d.get("executionDurationMs"),
        )


# 정규화된 이벤트 타입
NormalizedEvent = dict[str, Any]
EventListener = Callable[[NormalizedEvent], Awaitable[None]]


class JobManager:
    """
    잡 저장소 + 디스패처 + ComfyUI 메시지 라우터를 한곳에 묶음.

    외부에서는:
        - submit(items) → 잡 N개 생성 후 디스패치 트리거
        - cancel(job_id)
        - snapshot() → 현재 모든 잡 dict 리스트
        - subscribe(listener) → 정규화 이벤트 수신
    """

    def __init__(
        self,
        pool: WorkerPool,
        store: Optional[JobStore] = None,
        images_dir: Optional[Path] = None,
    ) -> None:
        self._pool = pool
        self._store = store or JobStore()
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._wakeup = asyncio.Event()
        self._listeners: set[EventListener] = set()
        self._dispatcher_task: Optional[asyncio.Task[None]] = None
        self._stopping = False
        self._paused = False
        self._images_dir = images_dir or DEFAULT_IMAGES_DIR
        self._images_dir.mkdir(parents=True, exist_ok=True)
        self._persist_tasks: set[asyncio.Task[None]] = set()

        pool.set_handlers(
            on_message=self._on_worker_message,
            on_binary=None,  # 현재 워크플로우는 SaveImage 가정 (URL 응답)
            on_status_change=self._on_worker_status_change,
        )

    # ---------- lifecycle ----------

    async def start(self) -> None:
        await self._store.open()
        # DB에서 기존 잡 복원
        stored = await self._store.load_all()
        async with self._lock:
            for d in stored:
                job = Job.from_dict(d)
                # queued/running 상태였던 잡은 pending으로 되돌림 (백엔드 재시작)
                if job.status in ("queued", "running"):
                    job.status = "pending"
                    job.worker_id = None
                    job.progress_percent = 0.0
                    job.current_node_name = ""
                    job.started_at = None
                self._jobs[job.id] = job
        if stored:
            logger.info("restored %d jobs from %s", len(stored), self._store._db_path)
        await self._pool.start()
        if self._dispatcher_task is None:
            self._dispatcher_task = asyncio.create_task(
                self._dispatch_loop(), name="dispatcher"
            )
        # 복원된 pending 잡이 있으면 디스패처 깨우기
        self._wakeup.set()

    async def stop(self) -> None:
        self._stopping = True
        self._wakeup.set()
        if self._dispatcher_task is not None:
            self._dispatcher_task.cancel()
            try:
                await self._dispatcher_task
            except (asyncio.CancelledError, Exception):
                pass
            self._dispatcher_task = None
        await self._pool.stop()
        await self._store.close()

    # ---------- public API ----------

    async def submit(
        self, items: list[dict[str, Any]]
    ) -> list[Job]:
        """
        items: [{filename, prompt, workflow}, ...]
        프론트가 시드/치환 박은 워크플로우를 그대로 넘겨받는다.
        """
        created: list[Job] = []
        async with self._lock:
            for item in items:
                job = Job(
                    id=str(uuid.uuid4()),
                    filename=item["filename"],
                    prompt=item["prompt"],
                    workflow=item["workflow"],
                )
                self._jobs[job.id] = job
                created.append(job)
        for job in created:
            await self._store.save(job.to_dict())
            await self._store.save_event(
                job.id, "created",
                details={"filename": job.filename, "prompt": job.prompt},
            )
            await self._emit({"type": "job.created", "job": job.to_dict()})
        self._wakeup.set()
        return created

    @property
    def paused(self) -> bool:
        return self._paused

    async def set_paused(self, paused: bool) -> None:
        if self._paused == paused:
            return
        self._paused = paused
        await self._emit({"type": "control.updated", "paused": self._paused})
        if not paused:
            # 재개 시 즉시 디스패처 깨움
            self._wakeup.set()

    async def cancel_all(self) -> int:
        """pending/queued/running 잡 전부 취소. 취소된 잡 개수 반환."""
        async with self._lock:
            targets = [
                j.id
                for j in self._jobs.values()
                if j.status in ("pending", "queued", "running")
            ]
        count = 0
        for job_id in targets:
            if await self.cancel(job_id):
                count += 1
        return count

    async def cancel(self, job_id: str) -> bool:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job.status in ("done", "error", "cancelled"):
                return False
            worker_id = job.worker_id
            job.status = "cancelled"
            job.finished_at = time.time()
            job_dict = job.to_dict()
        if worker_id is not None:
            worker = self._pool.get(worker_id)
            if worker is not None and worker.current_job_id == job_id:
                await worker.interrupt()
                worker.current_job_id = None
        await self._store.save(job_dict)
        await self._store.save_event(
            job_id, "cancelled",
            worker_id=worker_id,
        )
        await self._emit({"type": "job.updated", "job": job_dict})
        self._wakeup.set()
        return True

    async def snapshot(self) -> list[dict[str, Any]]:
        async with self._lock:
            return [j.to_dict() for j in self._jobs.values()]

    def subscribe(self, listener: EventListener) -> Callable[[], None]:
        self._listeners.add(listener)

        def unsubscribe() -> None:
            self._listeners.discard(listener)

        return unsubscribe

    # ---------- dispatcher ----------

    async def _dispatch_loop(self) -> None:
        while not self._stopping:
            await self._wakeup.wait()
            self._wakeup.clear()
            if self._stopping:
                break
            await self._try_dispatch()

    async def _try_dispatch(self) -> None:
        """idle 워커가 있는 한 pending 잡을 채워 넣는다 (paused일 땐 스킵)."""
        while True:
            if self._paused:
                return
            async with self._lock:
                pending = next(
                    (j for j in self._jobs.values() if j.status == "pending"),
                    None,
                )
                if pending is None:
                    return
                worker = self._pool.find_idle()
                if worker is None:
                    return
                pending.status = "queued"
                pending.worker_id = worker.id
                worker.current_job_id = pending.id
                job_dict = pending.to_dict()
                workflow = pending.workflow
                job_id = pending.id
            await self._store.save(job_dict)
            await self._store.save_event(
                job_id, "dispatched",
                worker_id=worker.id,
                details={"worker_url": worker.base_url},
            )
            await self._emit({"type": "job.updated", "job": job_dict})

            try:
                await worker.submit_prompt(prompt=workflow, prompt_id=job_id)
            except Exception as exc:
                logger.exception("worker %s submit failed", worker.id)
                if worker.current_job_id == job_id:
                    worker.current_job_id = None
                await self._reset_to_pending(
                    job_id,
                    error=f"submit failed: {exc}",
                )

    # ---------- ComfyUI raw → 정규화 ----------

    async def _on_worker_message(
        self, worker: ComfyWorker, payload: dict[str, Any]
    ) -> None:
        msg_type = payload.get("type")
        data = payload.get("data") or {}
        prompt_id = data.get("prompt_id")
        if msg_type == "status":
            return  # sid는 워커가 자체 처리
        if not prompt_id:
            return

        # 모든 ComfyUI 이벤트를 execution_events에 기록
        if msg_type in (
            "execution_start", "execution_success", "execution_error",
            "execution_interrupted", "progress", "executed",
        ):
            await self._store.save_execution_event(
                prompt_id, worker.id, msg_type, payload,
            )

        if msg_type == "execution_start":
            await self._update(
                prompt_id, status="running", started_at=time.time()
            )
            await self._store.save_event(
                prompt_id, "started",
                worker_id=worker.id,
            )
        elif msg_type == "execution_success":
            await self._finish(prompt_id, status="done")
        elif msg_type == "execution_interrupted":
            node_type = data.get("node_type", "?")
            await self._reset_to_pending(
                prompt_id,
                error=f"interrupted at {node_type}",
            )
        elif msg_type == "execution_error":
            error_msg = data.get("exception_message", "unknown error")
            await self._reset_to_pending(
                prompt_id,
                error=f"execution error: {error_msg}",
            )
        elif msg_type == "executed":
            output = data.get("output") or {}
            images = output.get("images") or []
            urls = [
                f"/images/{worker.id}/view"
                f"?filename={img.get('filename','')}"
                f"&subfolder={img.get('subfolder','')}"
                f"&type={img.get('type','')}"
                for img in images
            ]
            if urls:
                await self._update(prompt_id, image_urls_append=urls)
            for img in images:
                task = asyncio.create_task(
                    self._persist_image(prompt_id, worker, img),
                    name=f"persist:{prompt_id}",
                )
                self._persist_tasks.add(task)
                task.add_done_callback(self._persist_tasks.discard)
        elif msg_type == "progress":
            value = data.get("value", 0)
            maximum = data.get("max") or 1
            node_id = data.get("node", "")
            percent = (value / maximum) * 100 if maximum else 0
            node_name = ""
            async with self._lock:
                job = self._jobs.get(prompt_id)
                if job is not None:
                    node = job.workflow.get(node_id) if isinstance(node_id, str) else None
                    if isinstance(node, dict):
                        meta = node.get("_meta") or {}
                        node_name = meta.get("title", "") if isinstance(meta, dict) else ""
            await self._update(
                prompt_id,
                progress_percent=percent,
                current_node_name=node_name,
            )

    async def _on_worker_status_change(self, worker: ComfyWorker) -> None:
        # 워커가 죽었으면 그 워커가 들고 있던 잡을 pending으로 되돌림 (재시도)
        if not worker.alive and worker.current_job_id is not None:
            failed_id = worker.current_job_id
            worker.current_job_id = None
            await self._reset_to_pending(
                failed_id,
                error=f"worker {worker.id} disconnected",
            )
        await self._emit(
            {
                "type": "worker.updated",
                "worker": worker.info().__dict__,
            }
        )
        # 워커 살아나면 디스패처 깨우기
        if worker.alive:
            self._wakeup.set()

    # ---------- internal helpers ----------

    async def _update(self, job_id: str, **changes: Any) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            urls_append = changes.pop("image_urls_append", None)
            for key, value in changes.items():
                setattr(job, key, value)
            if urls_append:
                job.image_urls.extend(urls_append)
            payload = job.to_dict()
        await self._store.save(payload)
        await self._emit({"type": "job.updated", "job": payload})

    async def _finish(self, job_id: str, **changes: Any) -> None:
        worker_id_to_clear: Optional[str] = None
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in changes.items():
                setattr(job, key, value)
            job.finished_at = time.time()
            # 실행 시간 계산 (ms)
            if job.started_at is not None:
                job.execution_duration_ms = (
                    (job.finished_at - job.started_at) * 1000
                )
            worker_id_to_clear = job.worker_id
            payload = job.to_dict()
        if worker_id_to_clear:
            worker = self._pool.get(worker_id_to_clear)
            if worker is not None and worker.current_job_id == job_id:
                worker.current_job_id = None
        await self._store.save(payload)
        await self._store.save_event(
            job_id, "completed",
            worker_id=worker_id_to_clear,
            details={
                "executionDurationMs": payload.get("executionDurationMs"),
                "imageCount": len(payload.get("imageUrls", [])),
            },
        )
        await self._emit({"type": "job.updated", "job": payload})
        self._wakeup.set()

    async def _reset_to_pending(self, job_id: str, error: str) -> None:
        """오류 발생 시 잡을 pending으로 되돌림. 성공할 때까지 무한 재시도."""
        worker_id_to_clear: Optional[str] = None
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            worker_id_to_clear = job.worker_id
            job.retry_count += 1
            job.status = "pending"
            job.worker_id = None
            job.error = f"[retry {job.retry_count}] {error}"
            job.progress_percent = 0.0
            job.current_node_name = ""
            job.started_at = None
            payload = job.to_dict()
        if worker_id_to_clear:
            worker = self._pool.get(worker_id_to_clear)
            if worker is not None and worker.current_job_id == job_id:
                worker.current_job_id = None
        await self._store.save(payload)
        await self._store.save_event(
            job_id, "retrying",
            worker_id=worker_id_to_clear,
            details={
                "retryCount": job.retry_count,
                "error": error,
            },
        )
        await self._emit({"type": "job.updated", "job": payload})
        # 1초 대기 후 디스패처 깨우기
        await asyncio.sleep(RETRY_DELAY)
        self._wakeup.set()

    async def _get_dict(self, job_id: str) -> dict[str, Any]:
        async with self._lock:
            job = self._jobs.get(job_id)
            return job.to_dict() if job is not None else {"id": job_id}

    async def _emit(self, event: NormalizedEvent) -> None:
        for listener in list(self._listeners):
            try:
                await listener(event)
            except Exception:
                logger.exception("listener failed")

    # ---------- image persistence ----------

    async def _persist_image(
        self, job_id: str, worker: ComfyWorker, img: dict[str, Any]
    ) -> None:
        """ComfyUI 결과 이미지를 받아 sha256 이름으로 디스크에 저장 + DB 기록."""
        filename = img.get("filename", "")
        subfolder = img.get("subfolder", "")
        type_ = img.get("type", "output") or "output"
        if not filename:
            return
        ext = Path(filename).suffix.lower() or ".png"
        tmp_path = self._images_dir / f".tmp-{uuid.uuid4().hex}{ext}"
        hasher = hashlib.sha256()
        size = 0
        try:
            try:
                with tmp_path.open("wb") as f:
                    async for chunk in worker.stream_view(
                        {"filename": filename, "subfolder": subfolder, "type": type_}
                    ):
                        if not chunk:
                            continue
                        hasher.update(chunk)
                        f.write(chunk)
                        size += len(chunk)
            except Exception:
                tmp_path.unlink(missing_ok=True)
                raise
            sha = hasher.hexdigest()
            target = self._images_dir / f"{sha}{ext}"
            if target.exists():
                tmp_path.unlink(missing_ok=True)
            else:
                tmp_path.replace(target)

            async with self._lock:
                job = self._jobs.get(job_id)
                original_filename = job.filename if job else ""
                prompt = job.prompt if job else ""

            await self._store.save_image_record(
                hash=sha,
                job_id=job_id,
                original_filename=original_filename,
                comfy_filename=filename,
                subfolder=subfolder,
                type_=type_,
                worker_id=worker.id,
                extension=ext,
                size_bytes=size,
                prompt=prompt,
            )
            await self._emit(
                {
                    "type": "image.saved",
                    "jobId": job_id,
                    "hash": sha,
                    "extension": ext,
                    "sizeBytes": size,
                    "originalFilename": original_filename,
                    "status": "pending",
                }
            )
        except Exception:
            logger.exception(
                "persist image failed: job=%s filename=%s", job_id, filename
            )

    # ---------- 큐레이션 ----------

    async def update_curation(
        self,
        hash: str,
        *,
        status: Optional[str] = None,
        note: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        existing = await self._store.get_saved_image(hash)
        if existing is None:
            return None
        old_status = existing.get("status")
        updated = await self._store.update_curation(hash, status=status, note=note)
        if updated is None:
            return None
        if status is not None and status != old_status:
            await self._store.save_event(
                updated.get("jobId", ""),
                "curation_changed",
                details={
                    "hash": hash,
                    "oldStatus": old_status,
                    "newStatus": status,
                },
            )
        await self._emit({"type": "image.curation", "image": updated})
        return updated

    async def add_image_tags(self, hash: str, tags: list[str]) -> Optional[list[str]]:
        if await self._store.get_saved_image(hash) is None:
            return None
        result = await self._store.add_tags(hash, tags)
        await self._emit({"type": "image.curation", "hash": hash, "tags": result})
        return result

    async def remove_image_tag(self, hash: str, tag: str) -> Optional[list[str]]:
        if await self._store.get_saved_image(hash) is None:
            return None
        result = await self._store.remove_tag(hash, tag)
        await self._emit({"type": "image.curation", "hash": hash, "tags": result})
        return result

    async def empty_trash(self) -> int:
        """status='trashed' 이미지의 디스크 파일 + DB 행 영구 삭제."""
        targets = await self._store.list_trashed_for_purge()
        deleted = 0
        for item in targets:
            hash_val = item["hash"]
            ext = item["extension"] or ".png"
            path = self._images_dir / f"{hash_val}{ext}"
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.warning("failed to unlink trashed image %s", path)
            if await self._store.delete_saved_image(hash_val):
                deleted += 1
                await self._emit({"type": "image.deleted", "hash": hash_val})
        return deleted

    # ---------- 재생성 ----------

    async def regenerate_group(
        self, filename: str, *, count: int, seed_strategy: str = "random"
    ) -> list[Job]:
        """같은 filename의 가장 최근 Job 워크플로우를 재사용해 시드만 바꿔 N건 재제출."""
        if count < 1:
            return []
        latest = await self._store.get_latest_job_by_filename(filename)
        if latest is None:
            raise ValueError(f"no prior job for filename: {filename}")
        base_workflow = latest["_workflow"]
        prompt = latest["prompt"]
        items: list[dict[str, Any]] = []
        for i in range(count):
            wf = _clone_workflow_with_new_seed(
                base_workflow, strategy=seed_strategy, increment_offset=i + 1
            )
            items.append({"filename": filename, "prompt": prompt, "workflow": wf})
        return await self.submit(items)


# ---------- workflow seed helpers ----------

_SEED_KEYS = ("seed", "noise_seed")
_MAX_SEED = 2**32 - 1


def _clone_workflow_with_new_seed(
    workflow: dict[str, Any],
    *,
    strategy: str,
    increment_offset: int,
) -> dict[str, Any]:
    """워크플로우 JSON을 깊은 복사해 seed/noise_seed를 갱신한다.

    KSampler 등 시드를 갖는 모든 노드를 갱신.
    strategy="random": 새 랜덤 시드.
    strategy="increment": 기존 시드 + increment_offset (없으면 랜덤).
    """
    import copy

    cloned = copy.deepcopy(workflow)
    if not isinstance(cloned, dict):
        return cloned
    for node in cloned.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key in _SEED_KEYS:
            if key not in inputs:
                continue
            old = inputs[key]
            if strategy == "increment" and isinstance(old, int):
                inputs[key] = (old + increment_offset) & _MAX_SEED
            else:
                inputs[key] = random.randint(0, _MAX_SEED)
    return cloned
