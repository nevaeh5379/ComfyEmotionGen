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
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal, Optional

from comfy_client import ComfyWorker
from worker_pool import WorkerPool

logger = logging.getLogger(__name__)


JobStatus = Literal[
    "pending", "queued", "running", "done", "error", "cancelled"
]


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

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "prompt": self.prompt,
            "status": self.status,
            "workerId": self.worker_id,
            "error": self.error,
            "imageUrls": self.image_urls,
            "progressPercent": self.progress_percent,
            "currentNodeName": self.current_node_name,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
        }


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

    def __init__(self, pool: WorkerPool) -> None:
        self._pool = pool
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._wakeup = asyncio.Event()
        self._listeners: set[EventListener] = set()
        self._dispatcher_task: Optional[asyncio.Task[None]] = None
        self._stopping = False

        pool.set_handlers(
            on_message=self._on_worker_message,
            on_binary=None,  # 현재 워크플로우는 SaveImage 가정 (URL 응답)
            on_status_change=self._on_worker_status_change,
        )

    # ---------- lifecycle ----------

    async def start(self) -> None:
        await self._pool.start()
        if self._dispatcher_task is None:
            self._dispatcher_task = asyncio.create_task(
                self._dispatch_loop(), name="dispatcher"
            )

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
            await self._emit({"type": "job.created", "job": job.to_dict()})
        self._wakeup.set()
        return created

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
        if worker_id is not None:
            worker = self._pool.get(worker_id)
            if worker is not None and worker.current_job_id == job_id:
                await worker.interrupt()
                worker.current_job_id = None
        await self._emit({"type": "job.updated", "job": (await self._get_dict(job_id))})
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
        """idle 워커가 있는 한 pending 잡을 채워 넣는다."""
        while True:
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
            await self._emit({"type": "job.updated", "job": job_dict})

            try:
                await worker.submit_prompt(prompt=workflow, prompt_id=job_id)
            except Exception as exc:
                logger.exception("worker %s submit failed", worker.id)
                async with self._lock:
                    job = self._jobs.get(job_id)
                    if job is not None:
                        job.status = "error"
                        job.error = f"submit failed: {exc}"
                        job.finished_at = time.time()
                    if worker.current_job_id == job_id:
                        worker.current_job_id = None
                await self._emit(
                    {"type": "job.updated", "job": (await self._get_dict(job_id))}
                )
                # 다음 pending 시도 계속

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

        if msg_type == "execution_start":
            await self._update(
                prompt_id, status="running", started_at=time.time()
            )
        elif msg_type == "execution_success":
            await self._finish(prompt_id, status="done")
        elif msg_type == "execution_interrupted":
            node_type = data.get("node_type", "?")
            await self._finish(
                prompt_id,
                status="error",
                error=f"interrupted at {node_type}",
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
        # 워커가 죽었으면 그 워커가 들고 있던 잡을 error 처리
        if not worker.alive and worker.current_job_id is not None:
            failed_id = worker.current_job_id
            worker.current_job_id = None
            await self._finish(
                failed_id,
                status="error",
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
            worker_id_to_clear = job.worker_id
            payload = job.to_dict()
        if worker_id_to_clear:
            worker = self._pool.get(worker_id_to_clear)
            if worker is not None and worker.current_job_id == job_id:
                worker.current_job_id = None
        await self._emit({"type": "job.updated", "job": payload})
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
