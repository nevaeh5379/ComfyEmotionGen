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
from copy import deepcopy
import hashlib
import logging
import os
import re
import struct
import time
import urllib.parse
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import cast, Awaitable, Callable, Optional, overload, Any

from pydantic import TypeAdapter, BaseModel, Field, ConfigDict
from backend.src.models import (
    JobItem,
    JobStatus,
    JobResponse,
    WorkerViewResponse,
    DiagnosticsSnapshotResponse,
    JobQueryResponse,
    NormalizedEvent,
    SavedImageResponse,
    JSONValue,
)
from backend.src.workflow_models import ComfyWorkflow
from backend.src.worker import BaseWorker, WorkerInfo
from backend.src.job_store import JobStore
from backend.src.worker_pool import WorkerPool


@dataclass(frozen=True)
class WorkerView:
    """워커의 읽기 전용 뷰 (API 응답용 불변 데이터 클래스).
    Immutable read-only view of a worker, used for API responses.

    WorkerInfo 내부 상태를 외부에 노출할 때 스냅샷으로 사용한다.
    Acts as a snapshot of WorkerInfo's internal state for external exposure.
    """
    id: str
    url: str
    alive: bool
    busy: bool
    current_job_id: Optional[str]
    worker_type: str

    @classmethod
    def from_info(cls, info: WorkerInfo) -> "WorkerView":
        """WorkerInfo 객체로부터 WorkerView 인스턴스를 생성한다.
        Creates a WorkerView instance from a WorkerInfo object.
        """
        return cls(
            id=info.id,
            url=info.url,
            alive=info.alive,
            busy=info.busy,
            current_job_id=info.current_job_id,
            worker_type=info.worker_type,
        )

    def to_dict(self) -> dict[str, JSONValue]:
        """워커 뷰를 JSON 직렬화 가능한 딕셔너리로 변환한다.
        Converts the worker view to a JSON-serializable dictionary.
        """
        return {
            "id": self.id,
            "url": self.url,
            "alive": self.alive,
            "busy": self.busy,
            "currentJobId": self.current_job_id,
            "workerType": self.worker_type,
        }

    def to_response(self) -> WorkerViewResponse:
        """워커 뷰를 API 응답 모델(WorkerViewResponse)로 변환한다.
        Converts the worker view to an API response model (WorkerViewResponse).
        """
        return WorkerViewResponse(
            id=self.id,
            url=self.url,
            alive=self.alive,
            busy=self.busy,
            currentJobId=self.current_job_id,
            workerType=self.worker_type,
        )


logger = logging.getLogger(__name__)


RETRY_DELAY = 1.0  # 재시도 간격 (초)

# Resolve images directory: CEG_IMAGES_DIR > CEG_DATA_DIR/images > data/images
_env_images_dir = os.environ.get("CEG_IMAGES_DIR")
if _env_images_dir:
    DEFAULT_IMAGES_DIR = Path(_env_images_dir)
else:
    _env_data_dir = os.environ.get("CEG_DATA_DIR")
    if _env_data_dir:
        DEFAULT_IMAGES_DIR = Path(_env_data_dir) / "images"
    else:
        DEFAULT_IMAGES_DIR = Path("data/images")

# Resolve upload directory: CEG_UPLOAD_DIR > CEG_DATA_DIR/uploaded_images > data/uploaded_images
_env_upload_dir = os.environ.get("CEG_UPLOAD_DIR")
if _env_upload_dir:
    UPLOAD_IMAGES_DIR = Path(_env_upload_dir)
else:
    _env_data_dir = os.environ.get("CEG_DATA_DIR")
    if _env_data_dir:
        UPLOAD_IMAGES_DIR = Path(_env_data_dir) / "uploaded_images"
    else:
        UPLOAD_IMAGES_DIR = Path("data/uploaded_images")


class ActiveJobError(Exception):
    """워커에 진행 중인 잡이 있는데 force=False로 삭제 시도한 경우.
    Raised when attempting to remove a worker with an active job and force=False.

    워커를 강제 제거하려면 force=True를 사용해야 한다.
    Use force=True to forcefully remove a worker with an active job.
    """

    def __init__(self, worker_id: str, job_id: str) -> None:
        """에러 초기화. / Initialize with worker and job IDs.

        Args:
            worker_id: 활성 잡이 있는 워커 ID / The worker ID that has an active job.
            job_id: 해당 워커에서 실행 중인 잡 ID / The active job ID on that worker.
        """
        super().__init__(f"worker {worker_id} has active job {job_id}")
        self.worker_id = worker_id
        self.job_id = job_id


class Job(BaseModel):
    """단일 이미지 생성 작업을 나타내는 잡 모델.
    Pydantic model representing a single image generation job.

    상태(status), 진행률(progress), 워크플로우(workflow), 결과 이미지 URL 등
    잡의 전체 라이프사이클 데이터를 포함한다.
    Contains the full lifecycle data of a job including status, progress,
    workflow, result image URLs, and metadata.
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str
    filename: str
    prompt: str
    workflow: ComfyWorkflow = Field(default_factory=lambda: ComfyWorkflow.model_validate({}), alias="_workflow")
    status: JobStatus = JobStatus.PENDING
    worker_id: Optional[str] = Field(None, alias="workerId")
    error: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list, alias="imageUrls")
    saved_image_hashes: list[str] = Field(default_factory=list, alias="savedImageHashes")
    progress_percent: float = Field(0.0, alias="progressPercent")
    current_node_name: str = Field("", alias="currentNodeName")
    total_node_count: int = Field(0, alias="totalNodeCount")
    completed_node_count: int = Field(0, alias="completedNodeCount")
    created_at: float = Field(default_factory=time.time, alias="createdAt")
    started_at: Optional[float] = Field(None, alias="startedAt")
    finished_at: Optional[float] = Field(None, alias="finishedAt")
    retry_count: int = Field(0, alias="retryCount")
    execution_duration_ms: Optional[float] = Field(None, alias="executionDurationMs")
    meta: dict[str, str] = Field(default_factory=dict)
    ceg_template: str = Field("", alias="cegTemplate")
    image_uploads: dict[str, dict[str, str]] = Field(default_factory=dict, alias="imageUploads")
    worker_type: Optional[str] = Field(None, alias="workerType")
    target_worker_id: Optional[str] = Field(None, alias="targetWorkerId")

    def to_dict(self) -> dict[str, Any]:
        """잡을 JSON 직렬화 가능한 딕셔너리로 변환 (alias 키 사용).
        Converts the job to a JSON-serializable dict using aliased field names.
        """
        return self.model_dump(by_alias=True, mode="json")

    def to_response(self) -> JobResponse:
        """잡을 API 응답 모델(JobResponse)로 변환한다.
        Converts the job to an API response model (JobResponse).
        """
        return JobResponse(
            id=self.id,
            filename=self.filename,
            prompt=self.prompt,
            workflow=self.workflow,
            status=self.status,
            workerId=self.worker_id,
            error=self.error,
            imageUrls=self.image_urls,
            savedImageHashes=self.saved_image_hashes,
            progressPercent=self.progress_percent,
            currentNodeName=self.current_node_name,
            totalNodeCount=self.total_node_count,
            completedNodeCount=self.completed_node_count,
            createdAt=self.created_at,
            startedAt=self.started_at,
            finishedAt=self.finished_at,
            retryCount=self.retry_count,
            executionDurationMs=self.execution_duration_ms,
            meta=self.meta,
            cegTemplate=self.ceg_template,
            imageUploads=self.image_uploads,
            workerType=self.worker_type,
            targetWorkerId=self.target_worker_id,
        )

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Job:
        """딕셔너리로부터 Job 인스턴스를 생성한다 (DB 복원 시 사용).
        Creates a Job instance from a dictionary (used when restoring from DB).

        'workflow' 키를 '_workflow' alias로 자동 매핑하며,
        누락된 워크플로우는 빈 객체로 초기화한다.
        Automatically maps the 'workflow' key to the '_workflow' alias,
        and initializes missing workflows as empty objects.
        """
        d_copy = dict(d)
        if "workflow" in d_copy and "_workflow" not in d_copy:
            d_copy["_workflow"] = d_copy.pop("workflow")
        if "_workflow" not in d_copy or d_copy["_workflow"] is None:
            d_copy["_workflow"] = {}
        return cls.model_validate(d_copy)

    def clone(self) -> "Job":
        """현재 잡의 설정을 복제하여 새 잡을 생성한다 (재시도용).
        Clones the current job's configuration into a new job (for retries).

        새 UUID를 할당하고, 상태를 PENDING으로 초기화하며,
        진행 관련 필드를 모두 리셋한다. 워크플로우·메타데이터는 깊은 복사한다.
        Assigns a new UUID, resets status to PENDING, clears all progress fields,
        and deep-copies the workflow and metadata.
        """
        return Job.model_validate({
            "id": str(uuid.uuid4()),
            "filename": self.filename,
            "prompt": self.prompt,
            "_workflow": deepcopy(self.workflow),
            "status": JobStatus.PENDING,
            "workerId": None,
            "error": None,
            "imageUrls": [],
            "savedImageHashes": [],
            "progressPercent": 0.0,
            "currentNodeName": "",
            "totalNodeCount": 0,
            "completedNodeCount": 0,
            "createdAt": time.time(),
            "startedAt": None,
            "finishedAt": None,
            "retryCount": 0,
            "executionDurationMs": None,
            "meta": deepcopy(self.meta),
            "cegTemplate": self.ceg_template,
            "imageUploads": deepcopy(self.image_uploads),
            "workerType": self.worker_type,
            "targetWorkerId": self.target_worker_id,
        })


# 정규화된 이벤트 타입
event_adapter: TypeAdapter[NormalizedEvent] = TypeAdapter(NormalizedEvent)
EventListener = Callable[[NormalizedEvent], Awaitable[None]]


class JobManager:
    """잡 저장소 + 디스패처 + ComfyUI 메시지 라우터를 한곳에 묶음.
    Central manager combining job storage, dispatcher, and ComfyUI message router.

    외부에서는 / Public API:
        - submit(items) → 잡 N개 생성 후 디스패치 트리거 / Create N jobs and trigger dispatch
        - cancel(job_id) → 잡 취소 / Cancel a job
        - snapshot() → 현재 모든 활성 잡 리스트 / List all active jobs
        - subscribe(listener) → 정규화 이벤트 수신 / Subscribe to normalized events

    내부적으로는 워커 풀(WorkerPool)과 잡 저장소(JobStore)를 조율하여
    pending 잡을 idle 워커에 배정하고, ComfyUI WebSocket 이벤트를
    수신하여 잡 상태를 갱신한다.
    Internally coordinates the WorkerPool and JobStore to dispatch pending
    jobs to idle workers, and processes ComfyUI WebSocket events to update
    job states.
    """

    def __init__(
        self,
        pool: WorkerPool,
        store: Optional[JobStore] = None,
        images_dir: Optional[Path] = None,
    ) -> None:
        """JobManager 초기화.
        Initialize the JobManager.

        Args:
            pool: 워커 풀 인스턴스 / Worker pool instance for managing workers.
            store: 잡 영속화 저장소 (기본: 인메모리 JobStore) / Job persistence store (default: in-memory JobStore).
            images_dir: 결과 이미지 저장 디렉토리 / Directory for saving result images.
        """
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
        self._worker_previews: dict[str, bytes] = {}  # worker_id → latest preview image bytes

        pool.set_handlers(
            on_message=self._on_worker_message,
            on_binary=self._on_worker_binary,
            on_status_change=self._on_worker_status_change,
        )

    # ---------- lifecycle ----------

    async def start(self) -> None:
        """매니저 시작: DB 연결, 잡 복원, 워커 풀 시작, 디스패처 루프 생성.
        Start the manager: open DB, restore jobs, start worker pool, launch dispatcher loop.

        재시작 시 queued/running 상태였던 잡을 pending으로 되돌려
        다시 디스패치될 수 있도록 한다.
        On restart, resets queued/running jobs back to pending so they can be re-dispatched.
        """
        await self._store.open()
        # DB에서 paused 상태 복원
        paused_value = await self._store.get_setting("dispatch_paused")
        self._paused = paused_value == "true"
        if self._paused:
            logger.info("dispatch paused state restored from database")
        # DB에서 기존 잡 복원
        stored = await self._store.load_all()
        async with self._lock:
            for d in stored:
                job = Job.from_dict(d)
                # queued/running 상태였던 잡은 pending으로 되돌림 (백엔드 재시작)
                if job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
                    job.status = JobStatus.PENDING
                    job.worker_id = None
                    job.progress_percent = 0.0
                    job.current_node_name = ""
                    job.total_node_count = 0
                    job.completed_node_count = 0
                    job.started_at = None
                if job.status in (JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING):
                    self._jobs[job.id] = job
        if stored:
            logger.info("restored %d jobs from %s", len(stored), self._store._db_path)
        await self._pool.start()
        if self._dispatcher_task is None:
            self._dispatcher_task = asyncio.create_task(
                self._dispatch_loop(), name="dispatcher"
            )
        # paused가 아닐 때만 복원된 pending 잡 디스패치
        if not self._paused:
            self._wakeup.set()

    async def stop(self) -> None:
        """매니저 종료: 디스패처 취소, 워커 풀 종료, 이미지 저장 태스크 대기, DB 닫기.
        Stop the manager: cancel dispatcher, stop worker pool, await image persistence tasks, close DB.
        """
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
        if self._persist_tasks:
            logger.info("Waiting for %d background image persistence tasks to complete...", len(self._persist_tasks))
            await asyncio.gather(*self._persist_tasks, return_exceptions=True)
        await self._store.close()

    async def reload_jobs(self) -> None:
        """데이터베이스에서 잡을 다시 로드하고 인메모리 목록과 동기화한다.
        Reload jobs from the database and synchronize with the in-memory job list.

        queued/running 상태의 잡은 pending으로 되돌린다.
        Resets queued/running jobs back to pending.
        """
        stored = await self._store.load_all()
        async with self._lock:
            self._jobs.clear()
            for d in stored:
                job = Job.from_dict(d)
                if job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
                    job.status = JobStatus.PENDING
                    job.worker_id = None
                    job.progress_percent = 0.0
                    job.current_node_name = ""
                    job.total_node_count = 0
                    job.completed_node_count = 0
                    job.started_at = None
                if job.status in (JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING):
                    self._jobs[job.id] = job
        self._wakeup.set()
    async def _register_job(self, job: Job) -> None:
        """새 잡을 인메모리 저장소와 DB에 등록하고 생성 이벤트를 발행한다.
        Register a new job in both in-memory storage and DB, then emit a creation event.
        """
        async with self._lock:
            self._jobs[job.id] = job
        await self._store.save(job.to_dict())
        await self._store.save_event(
        job.id, "created",
        details={"filename": job.filename, "prompt": job.prompt},
        )
        await self._emit({"type": "job.created", "job": job.to_dict()})
    # ---------- public API ----------
    async def retry(self, items: list[Job]) -> list[Job]:
        """기존 잡들을 복제(clone)하여 새 잡으로 재시도한다.
        Retry existing jobs by cloning them into new jobs.

        Args:
            items: 재시도할 원본 잡 리스트 / List of original jobs to retry.

        Returns:
            새로 생성된 잡 리스트 / List of newly created cloned jobs.
        """
        new_jobs = [job.clone() for job in items]
        
        for job in new_jobs:
            await self._register_job(job)
        self._wakeup.set()
        return new_jobs

    @overload
    async def submit(self, items: list[JobItem]) -> list[Job]: ...

    @overload
    async def submit(self, items: JobItem) -> Job: ...


    async def submit(
        self, items: JobItem | list[JobItem]
    ) -> Job | list[Job]:
        """잡 아이템을 제출한다 (단일 또는 다건).
        Submit job item(s) for processing (single or batch).

        Args:
            items: 단일 JobItem 또는 리스트 / A single JobItem or a list of JobItems.

        Returns:
            단일 제출 시 Job, 다건 제출 시 list[Job].
            A single Job for single submission, list[Job] for batch.
        """
        if isinstance(items, JobItem):
            return (await self._submit_many([items]))[0]
        return await self._submit_many(items)

    async def _submit_many(self, items: list[JobItem]) -> list[Job]:
        """여러 JobItem을 Job으로 생성하고 등록한 뒤 디스패처를 깨운다.
        Create Jobs from multiple JobItems, register them, and wake the dispatcher.
        """
        created: list[Job] = self._create_jobs(items)
            

        for job in created:
            await self._register_job(job)
        self._wakeup.set()
        return created
    def _create_jobs(self, items: list[JobItem]) -> list[Job]:
        """JobItem 리스트를 Job 인스턴스 리스트로 변환한다 (UUID 자동 생성).
        Convert a list of JobItems into Job instances with auto-generated UUIDs.
        """
        return [
            Job.model_validate({
                "id": str(uuid.uuid4()),
                "filename": item.filename,
                "prompt": item.prompt,
                "_workflow": item.workflow if item.workflow else ComfyWorkflow.model_validate({}),
                "meta": item.meta,
                "cegTemplate": item.cegTemplate,
                "imageUploads": item.imageUploads,
                "workerType": item.workerType.value if item.workerType else None,
                "targetWorkerId": item.workerId,
            })
            for item in items
        ]
    @property
    def paused(self) -> bool:
        """디스패처가 일시정지 상태인지 반환한다.
        Returns whether the dispatcher is currently paused.
        """
        return self._paused

    async def set_paused(self, paused: bool) -> None:
        """디스패처 일시정지/재개 상태를 설정한다 (DB에 영속화).
        Set the dispatcher paused/resumed state (persisted to DB).

        재개 시 대기 중인 잡을 즉시 디스패치하기 위해 디스패처를 깨운다.
        On resume, wakes the dispatcher to immediately dispatch pending jobs.
        """
        if self._paused == paused:
            return
        self._paused = paused
        # paused 상태를 DB에 영속화하여 재시작 시 복원
        await self._store.save_setting("dispatch_paused", str(paused).lower())
        await self._emit({"type": "control.updated", "paused": self._paused})
        if not paused:
            # 재개 시 즉시 디스패처 깨움
            self._wakeup.set()

    # ---------- worker management ----------

    async def add_worker(self, url: str, *, worker_type: str = "comfyui") -> WorkerViewResponse:
        """새 워커 URL을 등록한다 (DB 영속화 + 풀 등록 + 이벤트 브로드캐스트).
        Register a new worker URL (persisted to DB, added to pool, event broadcasted).

        Args:
            url: 워커의 HTTP URL / The worker's HTTP URL.
            worker_type: 워커 타입 (기본 'comfyui') / Worker type (default 'comfyui').

        Returns:
            새 워커의 WorkerViewResponse / The new worker's WorkerViewResponse.

        Raises:
            ValueError: URL이 비어있거나 이미 등록된 경우 / If URL is empty or already registered.
        """
        url = url.strip().rstrip("/")
        if not url:
            raise ValueError("URL is empty")
        if self._pool.has_url(url):
            raise ValueError(f"URL already registered: {url}")
        worker = await self._pool.add(url, worker_type=worker_type)
        await self._store.add_worker_url(url, worker_type=worker_type)
        response = WorkerView.from_info(worker.info()).to_response()
        await self._emit({"type": "worker.added", "worker": response.model_dump()})
        # 새 워커가 alive 되면 dispatch loop이 자동 픽업.
        return response

    async def remove_worker(self, worker_id: str, *, force: bool = False) -> bool:
        """워커를 풀에서 제거한다.
        Remove a worker from the pool.

        진행 중인 잡이 있으면 force=False 시 ActiveJobError를 발생시킨다.
        force=True면 활성 잡을 취소하고 워커를 제거한다.
        If the worker has an active job and force=False, raises ActiveJobError.
        If force=True, cancels the active job and removes the worker.

        Args:
            worker_id: 제거할 워커 ID / ID of the worker to remove.
            force: 강제 제거 여부 / Whether to forcefully remove.

        Returns:
            제거 성공 시 True, 워커가 없으면 False / True if removed, False if worker not found.
        """
        worker = self._pool.get(worker_id)
        if worker is None:
            return False
        active_job_id = worker.current_job_id
        if active_job_id is not None and not force:
            raise ActiveJobError(worker_id=worker_id, job_id=active_job_id)
        url = worker.base_url
        if active_job_id is not None:
            # cancel()은 worker.interrupt() + current_job_id 클리어를 처리한다.
            await self.cancel(active_job_id)
        await self._pool.remove(worker_id)
        await self._store.remove_worker_url(url)
        await self._emit({"type": "worker.removed", "workerId": worker_id})
        return True

    async def cancel_all(self) -> int:
        """모든 활성 잡(pending/queued/running)을 일괄 취소한다.
        Cancel all active jobs (pending/queued/running) in batch.

        메모리 내 잡뿐 아니라 DB에만 남아있는 고아(orphan) 잡도 함께 취소한다.
        워커 인터럽트 및 큐 정리를 비동기 병렬로 수행한다.
        Also cancels orphan jobs that exist only in the DB.
        Worker interrupts and queue cleanup are performed in parallel.

        Returns:
            취소된 잡의 총 개수 / Total number of cancelled jobs.
        """
        now = time.time()
        job_updates: list[dict[str, JSONValue]] = []
        workers_to_interrupt = []

        async with self._lock:
            # 1. 메모리상 활성 잡 식별 및 상태 업데이트
            targets = [
                j for j in self._jobs.values()
                if j.status in (JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING)
            ]

            for job in targets:
                worker_id = job.worker_id
                job.status = JobStatus.CANCELLED
                job.finished_at = now

                # 실행 중인 워커 식별 및 current_job_id 클리어
                if worker_id is not None:
                    worker = self._pool.get(worker_id)
                    if worker is not None and worker.current_job_id == job.id:
                        workers_to_interrupt.append((worker, job.id))
                        worker.current_job_id = None

                job_updates.append({
                    "id": job.id,
                    "finished_at": now,
                    "worker_id": worker_id,
                    "dict": job.to_dict(),
                })
                # 메모리(활성 잡 목록)에서 즉시 제거하여 디스패처 레이스 방지
                self._jobs.pop(job.id, None)

        # 2. DB에서만 활성 상태로 남아있을 수 있는 오펀 잡들도 백업 취소 처리
        try:
            db_jobs = await self._store.get_all_jobs_minimal()
            cancelled_ids = {str(u["id"]) for u in job_updates}
            for db_job in db_jobs:
                jid = db_job["id"]
                if jid not in cancelled_ids and db_job["status"] in (JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING):
                    job_updates.append({
                        "id": jid,
                        "finished_at": now,
                        "worker_id": None,
                        "dict": {
                            "id": jid,
                            "status": JobStatus.CANCELLED,
                            "finishedAt": now,
                        }
                    })
        except Exception:
            logger.exception("Failed to query orphan active jobs from database during cancel_all")

        if not job_updates:
            return 0

        # 3. DB 일괄 저장
        await self._store.cancel_batch(job_updates)

        # 4. WebSocket 이벤트 방출
        # 4a. 워커 정보 갱신 이벤트 방출
        for worker, _ in workers_to_interrupt:
            try:
                await self._emit(
                    {
                        "type": "worker.updated",
                        "worker": WorkerView.from_info(worker.info()).to_dict(),
                    }
                )
            except Exception:
                logger.exception("Failed to emit worker update event during cancel_all")

        # 4b. 잡 갱신 이벤트 방출
        for item in job_updates:
            try:
                await self._emit({"type": "job.updated", "job": item["dict"]})
            except Exception:
                logger.exception("Failed to emit job update event during cancel_all")

        # 5. 비동기 워커 인터럽트 및 큐 정리 병렬 실행
        async def interrupt_and_clear_worker_queue(w: BaseWorker, jid: str) -> None:
            """워커에 인터럽트를 보내고 큐에서 잡을 제거한다 (실패 무시).
            Send interrupt to worker and remove job from queue (failures ignored).
            """
            try:
                await w.interrupt()
            except Exception:
                logger.warning("worker %s interrupt failed during cancel_all", w.id)
            try:
                await w.delete_from_queue(jid)
            except Exception:
                logger.warning("worker %s delete_from_queue(%s) failed during cancel_all", w.id, jid)

        tasks = []
        for worker, jid in workers_to_interrupt:
            tasks.append(asyncio.create_task(interrupt_and_clear_worker_queue(worker, jid)))

        for worker in self._pool.all():
            tasks.append(asyncio.create_task(worker.clear_queue()))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        self._wakeup.set()
        return len(job_updates)

    async def remove(self, job_id: str) -> bool:
        """잡을 메모리와 DB에서 영구 삭제한다.
        Permanently delete a job from both memory and the persistent store.

        Args:
            job_id: 삭제할 잡 ID / ID of the job to delete.

        Returns:
            삭제 성공 시 True, 잡이 없으면 False / True if deleted, False if job not found.
        """
        async with self._lock:
            job = self._jobs.pop(job_id, None)
            if job is None:
                return False
        await self._store.delete(job_id)
        await self._emit({"type": "job.deleted", "jobId": job_id})
        self._wakeup.set()
        return True

    async def remove_batch(self, job_ids: list[str]) -> int:
        """여러 잡을 일괄 영구 삭제한다.
        Permanently delete multiple jobs in batch.

        Args:
            job_ids: 삭제할 잡 ID 리스트 / List of job IDs to delete.

        Returns:
            실제 삭제된 잡 개수 / Count of actually removed jobs.
        """
        if not job_ids:
            return 0
        async with self._lock:
            for jid in job_ids:
                self._jobs.pop(jid, None)
        await self._store.delete_batch(job_ids)
        for jid in job_ids:
            await self._emit({"type": "job.deleted", "jobId": jid})
        self._wakeup.set()
        return len(job_ids)

    async def cancel(self, job_id: str) -> bool:
        """단일 잡을 취소한다.
        Cancel a single job.

        이미 완료/에러/취소 상태인 잡은 취소할 수 없다.
        실행 중인 워커가 있으면 인터럽트를 보내고 큐에서 제거한다.
        Jobs in done/error/cancelled state cannot be cancelled.
        If a worker is executing the job, sends an interrupt and removes from queue.

        Args:
            job_id: 취소할 잡 ID / ID of the job to cancel.

        Returns:
            취소 성공 시 True, 불가능하면 False / True if cancelled, False otherwise.
        """
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job.status in (JobStatus.DONE, JobStatus.ERROR, JobStatus.CANCELLED):
                return False
            worker_id = job.worker_id
            job.status = JobStatus.CANCELLED
            job.finished_at = time.time()
            job_dict = job.to_dict()
        if worker_id is not None:
            worker = self._pool.get(worker_id)
            if worker is not None and worker.current_job_id == job_id:
                await worker.interrupt()
                worker.current_job_id = None
                await self._emit(
                    {
                        "type": "worker.updated",
                        "worker": WorkerView.from_info(worker.info()).to_dict(),
                    }
                )
                await worker.delete_from_queue(job_id)
        await self._store.save(job_dict)
        await self._store.save_event(
            job_id, "cancelled",
            worker_id=worker_id,
        )
        await self._emit({"type": "job.updated", "job": job_dict})
        async with self._lock:
            self._jobs.pop(job_id, None)
        self._wakeup.set()
        return True

    async def snapshot(self) -> list[JobResponse]:
        """현재 인메모리에 있는 모든 활성 잡의 스냅샷을 반환한다.
        Returns a snapshot of all currently active in-memory jobs.
        """
        async with self._lock:
            return [j.to_response() for j in self._jobs.values()]

    async def diagnostics_snapshot(self) -> DiagnosticsSnapshotResponse:
        """시스템 진단 정보 스냅샷을 반환한다 (잡 수, 리스너 수, 디스패처 상태 등).
        Returns a diagnostics snapshot (job counts, listener count, dispatcher state, etc.).
        """
        async with self._lock:
            job_counts: dict[str, int] = {}
            for job in self._jobs.values():
                key = str(job.status)
                job_counts[key] = job_counts.get(key, 0) + 1
            dispatcher_done = (
                self._dispatcher_task.done()
                if self._dispatcher_task is not None
                else None
            )
            return DiagnosticsSnapshotResponse(
                jobsTotal=len(self._jobs),
                jobsByStatus=job_counts,
                listeners=len(self._listeners),
                persistTasks=len(self._persist_tasks),
                dispatcherTaskDone=dispatcher_done,
                stopping=self._stopping,
                paused=self._paused,
            )

    async def query_jobs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        statuses: Optional[list[str]] = None,
        search_tags: Optional[list[str]] = None,
        created_at_from: Optional[float] = None,
        created_at_to: Optional[float] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> JobQueryResponse:
        """필터·정렬·페이지네이션을 적용하여 잡을 조회한다.
        Query jobs with filtering, sorting, and pagination.

        인메모리에 있는 활성 잡은 최신 상태를 반영하고,
        나머지는 DB에서 복원한다.
        Active in-memory jobs reflect the latest state;
        others are restored from the DB.

        Args:
            limit: 페이지당 최대 잡 수 / Max jobs per page.
            offset: 건너뛸 잡 수 / Number of jobs to skip.
            statuses: 상태 필터 / Status filter list.
            search_tags: 태그 검색 필터 / Tag search filter.
            created_at_from: 생성 시각 하한 (Unix timestamp) / Created-at lower bound.
            created_at_to: 생성 시각 상한 (Unix timestamp) / Created-at upper bound.
            sort_by: 정렬 기준 필드 / Sort field.
            sort_order: 정렬 방향 ('asc' 또는 'desc') / Sort direction.

        Returns:
            페이지네이션된 잡 응답 / Paginated job query response.
        """
        total = await self._store.count_jobs(
            statuses=statuses,
            search_tags=search_tags,
            created_at_from=created_at_from,
            created_at_to=created_at_to,
        )
        items = await self._store.query_jobs(
            limit=limit,
            offset=offset,
            statuses=statuses,
            search_tags=search_tags,
            created_at_from=created_at_from,
            created_at_to=created_at_to,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        response_items: list[JobResponse] = []
        async with self._lock:
            for item in items:
                jid = item["id"]
                if jid in self._jobs:
                    response_items.append(self._jobs[jid].to_response())
                else:
                    response_items.append(Job.from_dict(item).to_response())
        return JobQueryResponse(total=total, items=response_items, limit=limit, offset=offset)

    async def get_job(self, job_id: str) -> Optional[Job]:
        """ID로 잡을 조회한다 (인메모리 → DB 순서로 탐색).
        Look up a job by ID (checks in-memory first, then falls back to DB).

        Args:
            job_id: 조회할 잡 ID / The job ID to look up.

        Returns:
            찾은 Job 또는 None / The Job if found, otherwise None.
        """
        async with self._lock:
            job = self._jobs.get(job_id)
        if job is not None:
            return job
        job_dict = await self._store.get_job(job_id)
        if job_dict is not None:
            return Job.from_dict(job_dict)
        return None

    def subscribe(self, listener: EventListener) -> Callable[[], None]:
        """정규화된 이벤트 리스너를 구독하고, 구독 해제 함수를 반환한다.
        Subscribe a normalized event listener and return an unsubscribe function.

        Args:
            listener: 이벤트를 수신할 비동기 콜백 / Async callback to receive events.

        Returns:
            호출 시 구독을 해제하는 함수 / A function that unsubscribes when called.
        """
        self._listeners.add(listener)

        def unsubscribe() -> None:
            self._listeners.discard(listener)

        return unsubscribe

    # ---------- dispatcher ----------

    async def _dispatch_loop(self) -> None:
        """디스패처 메인 루프: wakeup 시그널을 기다리며 잡-워커 매칭을 시도한다.
        Main dispatcher loop: waits for wakeup signals and attempts job-worker matching.

        stopping 플래그가 설정되면 종료한다.
        Exits when the stopping flag is set.
        """
        while not self._stopping:
            try:
                await self._wakeup.wait()
                self._wakeup.clear()
                if self._stopping:
                    break
                await self._try_dispatch()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("dispatch_loop unexpected error")
                await asyncio.sleep(1)

    async def _try_dispatch(self) -> None:
        """idle 워커가 있는 한 pending 잡을 매칭하여 디스패치한다.
        Match and dispatch pending jobs to idle workers as long as workers are available.

        paused 상태일 때는 스킵한다. target_worker_id가 지정된 잡은
        해당 워커만 대기하고, 그 외 잡은 동일 타입의 임의 idle 워커에 배정된다.
        Skips when paused. Jobs with target_worker_id wait for that specific
        worker; others are assigned to any idle worker of the same type.
        """
        while True:
            if self._paused:
                return
            async with self._lock:
                pending: Optional[Job] = None
                worker: Optional[BaseWorker] = None
                for candidate in self._jobs.values():
                    if candidate.status != JobStatus.PENDING:
                        continue
                    if candidate.target_worker_id:
                        target = self._pool.get(candidate.target_worker_id)
                        if (
                            target is not None
                            and target.alive
                            and not target.busy
                            and target.worker_type == (candidate.worker_type or "comfyui")
                        ):
                            pending = candidate
                            worker = target
                            break
                        # A targeted job must wait for its target, but must not
                        # spin forever and block later dispatchable jobs.
                        continue
                    idle = self._pool.find_idle(
                        worker_type=candidate.worker_type or "comfyui"
                    )
                    if idle is not None:
                        pending = candidate
                        worker = idle
                        break
                if pending is None or worker is None:
                    return
                pending.status = JobStatus.QUEUED
                pending.worker_id = worker.id
                worker.current_job_id = pending.id
                worker_updated_payload: dict[str, JSONValue] = {
                    "type": "worker.updated",
                    "worker": cast(JSONValue, WorkerView.from_info(worker.info()).to_dict()),
                }
                job_dict = pending.to_dict()
                workflow = pending.workflow
                image_uploads = pending.image_uploads
                job_id = pending.id
            await self._store.save(job_dict)
            await self._store.save_event(
                job_id, "dispatched",
                worker_id=worker.id,
                details={"worker_url": worker.base_url},
            )
            await self._emit(worker_updated_payload)
            await self._emit({"type": "job.updated", "job": job_dict})

            # 이미지 마커 치환 (워커로 업로드 후 실제 파일명으로 교체)
            if image_uploads:
                async with self._lock:
                    job = self._jobs.get(job_id)
                    if job is None or job.status == JobStatus.CANCELLED:
                        continue  # 취소되었으므로 진행 중단
                workflow = await _resolve_image_markers(
                    workflow, image_uploads, worker
                )

            async with self._lock:
                job = self._jobs.get(job_id)
                if job is None or job.status == JobStatus.CANCELLED:
                    continue  # 취소되었으므로 제출 중단

            try:
                await worker.submit_prompt(prompt=workflow, prompt_id=job_id)
            except Exception as exc:
                logger.exception("worker %s submit failed", worker.id)
                if worker.current_job_id == job_id:
                    worker.current_job_id = None
                    await self._emit(
                        {
                            "type": "worker.updated",
                            "worker": WorkerView.from_info(worker.info()).to_dict(),
                        }
                    )
                await self._reset_to_pending(
                    job_id,
                    error=f"submit failed: {exc}",
                )
            else:
                # submit 중 취소됐다면 바로 큐에서 제거
                async with self._lock:
                    job = self._jobs.get(job_id)
                    # cancel() 등에서 pop되어 None이 된 경우도 취소 상태로 판별
                    was_cancelled = job is None or job.status == JobStatus.CANCELLED
                if was_cancelled:
                    await worker.delete_from_queue(job_id)

    # ---------- Worker event dispatch ----------

    async def _on_worker_message(
        self, worker: BaseWorker, payload: dict[str, JSONValue]
    ) -> None:
        """워커 타입에 따라 이벤트 핸들러를 분기한다.
        Routes incoming worker messages to the appropriate handler based on worker type.

        comfyui → _on_comfyui_message, nai → _on_nai_message.
        """
        wt = worker.worker_type
        if wt == "comfyui" or wt is None:
            await self._on_comfyui_message(worker, payload)
        elif wt == "nai":
            await self._on_nai_message(worker, payload)
        else:
            logger.warning(
                "unhandled worker_type %s, ignoring message", wt
            )

    async def _on_comfyui_message(
        self, worker: BaseWorker, payload: dict[str, JSONValue]
    ) -> None:
        """ComfyUI 워커의 WebSocket 메시지를 처리한다.
        Handles WebSocket messages from a ComfyUI worker.

        처리하는 이벤트 타입 / Handled event types:
        - execution_start: 실행 시작 → 상태를 RUNNING으로 전환
        - execution_success: 실행 성공 → 잡 완료 처리
        - execution_interrupted: 인터럽트 → pending으로 재시도
        - execution_error: 에러 → pending으로 재시도
        - executing: 노드 실행 → 완료 노드 카운트 증가
        - execution_cached: 캐시된 노드 → 완료 카운트에 반영
        - progress_state: 상태 업데이트 → 완료 노드 수 동기화
        - executed: 노드 출력 결과 → 이미지 URL 추출 및 저장
        - progress: 진행률 → 퍼센트 및 현재 노드명 갱신
        """
        msg_type_val = payload.get("type")
        msg_type = str(msg_type_val) if msg_type_val else ""
        data_val = payload.get("data")
        data = data_val if isinstance(data_val, dict) else {}
        prompt_id_val = data.get("prompt_id")
        prompt_id = str(prompt_id_val) if prompt_id_val else ""
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
            # Count total executable nodes from workflow
            async with self._lock:
                job = self._jobs.get(prompt_id)
                total_nodes = 0
                if job is not None and job.workflow and job.workflow.root:
                    total_nodes = len(job.workflow.root)
            logger.info(
                "[NODE-TRACK] execution_start: %s total_nodes=%d", prompt_id, total_nodes,
            )
            await self._update(
                prompt_id, status=JobStatus.RUNNING, started_at=time.time(),
                total_node_count=total_nodes, completed_node_count=0,
            )
            await self._store.save_event(
                prompt_id, "started",
                worker_id=worker.id,
            )
        elif msg_type == "execution_success":
            await self._finish(prompt_id)
        elif msg_type == "execution_interrupted":
            node_type = str(data.get("node_type") or "?")
            await self._reset_to_pending(
                prompt_id,
                error=f"interrupted at {node_type}",
            )
        elif msg_type == "execution_error":
            error_msg = str(data.get("exception_message") or "unknown error")
            await self._reset_to_pending(
                prompt_id,
                error=f"execution error: {error_msg}",
            )
        elif msg_type == "executing":
            node_id_val = data.get("node")
            node_id = str(node_id_val) if node_id_val is not None else None
            if node_id is not None:
                job_dict: dict[str, JSONValue] | None = None
                # Node transition: increment completed count
                async with self._lock:
                    job = self._jobs.get(prompt_id)
                    if job is not None:
                        job.completed_node_count += 1
                        logger.info(
                            "[NODE-TRACK] executing: %s node=%s completed=%d/%d",
                            prompt_id, node_id, job.completed_node_count,
                            job.total_node_count,
                        )
                        job_dict = job.to_dict()
                if job_dict is not None:
                    await self._store.save(job_dict)
                    await self._emit({"type": "job.updated", "job": job_dict})
        elif msg_type == "execution_cached":
            cached_val = data.get("nodes")
            cached = cached_val if isinstance(cached_val, list) else []
            if cached:
                job_dict = None
                async with self._lock:
                    job = self._jobs.get(prompt_id)
                    if job is not None:
                        job.completed_node_count += len(cached)
                        logger.info(
                            "[NODE-TRACK] execution_cached: %s cached=%s completed=%d/%d",
                            prompt_id, cached, job.completed_node_count,
                            job.total_node_count,
                        )
                        job_dict = job.to_dict()
                if job_dict is not None:
                    await self._store.save(job_dict)
                    await self._emit({"type": "job.updated", "job": job_dict})
        elif msg_type == "progress_state":
            nodes = data.get("nodes")
            if isinstance(nodes, dict):
                job_dict = None
                async with self._lock:
                    job = self._jobs.get(prompt_id)
                    if job is not None:
                        finished = sum(
                            1 for n in nodes.values()
                            if isinstance(n, dict) and n.get("state") == "finished"
                        )
                        # Only move forward — progress_state doesn't include cached nodes
                        if finished > job.completed_node_count:
                            logger.info(
                                "[NODE-TRACK] progress_state: %s completed %d→%d (total=%d)",
                                prompt_id, job.completed_node_count, finished,
                                job.total_node_count,
                            )
                            job.completed_node_count = finished
                            job_dict = job.to_dict()
                        else:
                            logger.info(
                                "[NODE-TRACK] progress_state: %s finished=%d ignored (current=%d)",
                                prompt_id, finished, job.completed_node_count,
                            )
                if job_dict is not None:
                    await self._store.save(job_dict)
                    await self._emit({"type": "job.updated", "job": job_dict})
        elif msg_type == "executed":
            output = cast(dict[str, JSONValue], data.get("output") or {})
            images = output.get("images")
            urls = []
            if isinstance(images, list):
                for img in images:
                    if isinstance(img, dict):
                        filename = str(img.get("filename", ""))
                        subfolder = str(img.get("subfolder", ""))
                        img_type = str(img.get("type", ""))
                        urls.append(
                            f"/images/{worker.id}/view"
                            f"?filename={urllib.parse.quote(filename)}"
                            f"&subfolder={urllib.parse.quote(subfolder)}"
                            f"&type={urllib.parse.quote(img_type)}"
                        )
            if urls:
                await self._update(prompt_id, image_urls_append=urls)
            if isinstance(images, list):
                for img in images:
                    if isinstance(img, dict):
                        task = asyncio.create_task(
                            self._persist_image(prompt_id, worker, img),
                            name=f"persist:{prompt_id}",
                        )
                        self._persist_tasks.add(task)
                        task.add_done_callback(self._persist_tasks.discard)
        elif msg_type == "progress":
            value_val = data.get("value")
            value = float(value_val) if isinstance(value_val, (int, float)) else 0.0
            max_val = data.get("max")
            maximum = float(max_val) if isinstance(max_val, (int, float)) and max_val != 0 else 1.0
            node_id_val = data.get("node", "")
            node_id = str(node_id_val) if isinstance(node_id_val, str) else ""
            percent = (value / maximum) * 100
            node_name = ""
            async with self._lock:
                job = self._jobs.get(prompt_id)
                if job is not None:
                    node = job.workflow.root.get(node_id) if node_id else None
                    if node is not None and node.meta:
                        node_name = node.meta.get("title", "")
            await self._update(
                prompt_id,
                progress_percent=percent,
                current_node_name=node_name,
            )

    async def _on_worker_status_change(self, worker: BaseWorker) -> None:
        """워커의 alive 상태 변경 시 호출되는 핸들러.
        Handler called when a worker's alive status changes.

        워커가 죽으면 해당 워커의 활성 잡을 pending으로 되돌리고
        미리보기 캐시를 제거한다. 워커가 살아나면 디스패처를 깨운다.
        When a worker dies, resets its active job to pending and clears
        preview cache. When a worker comes alive, wakes the dispatcher.
        """
        # 워커가 죽었으면 그 워커가 들고 있던 잡을 pending으로 되돌림 (재시도)
        if not worker.alive and worker.current_job_id is not None:
            failed_id = worker.current_job_id
            worker.current_job_id = None
            await self._reset_to_pending(
                failed_id,
                error=f"worker {worker.id} disconnected",
            )
        # 워커 죽으면 미리보기 캐시 제거
        if not worker.alive:
            self._clear_worker_preview(worker.id)
        await self._emit(
            {
                "type": "worker.updated",
                "worker": WorkerView.from_info(worker.info()).to_dict(),
            }
        )
        # 워커 살아나면 디스패처 깨우기
        if worker.alive:
            self._wakeup.set()

    async def _on_worker_binary(self, worker: BaseWorker, data: bytes) -> None:
        """ComfyUI 워커의 바이너리 WebSocket 메시지를 처리한다 (미리보기 이미지).
        Handles binary WebSocket messages from a ComfyUI worker (preview images).

        지원하는 이벤트 타입 / Supported event types:
        - 1: PREVIEW_IMAGE (JPEG/PNG, 8바이트 헤더)
        - 2: UNENCODED_PREVIEW_IMAGE (4바이트 헤더)
        - 4: PREVIEW_IMAGE_WITH_METADATA (가변 메타데이터 헤더)

        파싱된 이미지 바이트를 워커별 캐시에 저장하고 worker.preview 이벤트를 발행한다.
        Stores parsed image bytes in per-worker cache and emits a worker.preview event.
        """
        total_len = len(data)
        logger.debug("[PREVIEW-DEBUG] _on_worker_binary: worker=%s total=%d bytes", worker.id, total_len)
        if total_len < 4:
            return
        try:
            event_type = struct.unpack(">I", data[:4])[0]
        except struct.error:
            return

        image_bytes: bytes | None = None

        if event_type == 1:  # PREVIEW_IMAGE
            if total_len < 8:
                return
            img_fmt = struct.unpack(">I", data[4:8])[0]
            image_bytes = data[8:]
            logger.debug("[PREVIEW-DEBUG] PREVIEW_IMAGE: fmt=%s img=%d bytes", 'JPEG' if img_fmt==1 else 'PNG', len(image_bytes))
        elif event_type == 2:  # UNENCODED_PREVIEW_IMAGE
            image_bytes = data[4:]
            logger.debug("[PREVIEW-DEBUG] UNENCODED_PREVIEW: img=%d bytes", len(image_bytes))
        elif event_type == 4:  # PREVIEW_IMAGE_WITH_METADATA
            if total_len < 8:
                return
            try:
                meta_len = struct.unpack(">I", data[4:8])[0]
            except struct.error:
                return
            image_bytes = data[8 + meta_len:]
            logger.debug("[PREVIEW-DEBUG] PREVIEW_WITH_META: meta=%d img=%d bytes", meta_len, len(image_bytes))
        else:
            logger.debug("[PREVIEW-DEBUG] unknown event_type=%d", event_type)
            return

        if image_bytes and len(image_bytes) > 0:
            self._worker_previews[worker.id] = image_bytes
            logger.debug("[PREVIEW-DEBUG] stored preview for %s: %d bytes", worker.id, len(image_bytes))
            await self._emit({
                "type": "worker.preview",
                "workerId": worker.id,
            })
            logger.debug("[PREVIEW-DEBUG] emitted worker.preview for %s", worker.id)
        else:
            logger.warning("[PREVIEW-DEBUG] no image_bytes extracted")

    async def _on_nai_message(
        self, worker: BaseWorker, payload: dict[str, JSONValue]
    ) -> None:
        """NAI(NovelAI) 워커 이벤트 핸들러 (스켈레톤 — 미구현).
        NAI (NovelAI) worker event handler (skeleton — not yet implemented).

        TODO: 실제 NAI 이벤트 스펙에 맞게 구현 필요.
        TODO: Implement according to actual NAI event specification.
        """
        logger.info("NAI message from %s: %s", worker.id, payload.get("type", "unknown"))

    # ---------- worker preview ----------

    def get_worker_preview(self, worker_id: str) -> Optional[bytes]:
        """워커의 최신 미리보기 이미지 바이트를 반환한다 (없으면 None).
        Returns the latest preview image bytes for a worker (None if not available).

        Args:
            worker_id: 미리보기를 조회할 워커 ID / Worker ID to get preview for.
        """
        return self._worker_previews.get(worker_id)

    def _clear_worker_preview(self, worker_id: str) -> None:
        """워커의 미리보기 캐시를 제거한다.
        Clears the preview cache for a specific worker.
        """
        self._worker_previews.pop(worker_id, None)

    # ---------- internal helpers ----------

    async def _update(
        self,
        job_id: str,
        *,
        status: Optional[JobStatus] = None,
        started_at: Optional[float] = None,
        total_node_count: Optional[int] = None,
        completed_node_count: Optional[int] = None,
        progress_percent: Optional[float] = None,
        current_node_name: Optional[str] = None,
        image_urls_append: Optional[list[str]] = None,
    ) -> None:
        """잡의 필드를 선택적으로 업데이트하고 DB 저장 + 이벤트 발행한다.
        Selectively update job fields, persist to DB, and emit an update event.

        None이 아닌 인자만 업데이트된다. image_urls_append는 기존 URL 리스트에 추가된다.
        Only non-None arguments are applied. image_urls_append extends the existing URL list.
        """
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if status is not None:
                job.status = status
            if started_at is not None:
                job.started_at = started_at
            if total_node_count is not None:
                job.total_node_count = total_node_count
            if completed_node_count is not None:
                job.completed_node_count = completed_node_count
            if progress_percent is not None:
                job.progress_percent = progress_percent
            if current_node_name is not None:
                job.current_node_name = current_node_name
            if image_urls_append is not None:
                job.image_urls.extend(image_urls_append)
            payload = job.to_dict()
        await self._store.save(payload)
        await self._emit({"type": "job.updated", "job": payload})

    async def _finish(self, job_id: str) -> None:
        """잡을 성공(DONE) 상태로 전환하고, 실행 시간을 계산하며, 워커를 해제한다.
        Transition a job to DONE status, calculate execution duration, and release the worker.

        완료된 잡은 인메모리 목록에서 제거되고 디스패처를 깨운다.
        Finished jobs are removed from the in-memory list and the dispatcher is woken up.
        """
        worker_id_to_clear: Optional[str] = None
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = JobStatus.DONE
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
                await self._emit(
                    {
                        "type": "worker.updated",
                        "worker": WorkerView.from_info(worker.info()).to_dict(),
                    }
                )
        await self._store.save(payload)
        await self._store.save_event(
            job_id, "completed",
            worker_id=worker_id_to_clear,
            details={
                "executionDurationMs": payload.get("executionDurationMs"),
                "imageCount": len(cast(list[JSONValue], payload.get("imageUrls") or [])),
            },
        )
        await self._emit({"type": "job.updated", "job": payload})
        async with self._lock:
            self._jobs.pop(job_id, None)
        self._wakeup.set()

    async def _reset_to_pending(self, job_id: str, error: str) -> None:
        """오류 발생 시 잡을 pending으로 되돌려 재시도한다 (최대 3회).
        Reset a job to pending for retry on error (max 3 retries).

        재시도 횟수가 3회를 초과하면 ERROR 상태로 전환하고 인메모리에서 제거한다.
        재시도 시에는 1초 대기 후 디스패처를 깨운다.
        If retry count exceeds 3, transitions to ERROR and removes from memory.
        On retry, waits 1 second before waking the dispatcher.

        Args:
            job_id: 되돌릴 잡 ID / ID of the job to reset.
            error: 에러 메시지 / Error message describing the failure.
        """
        worker_id_to_clear: Optional[str] = None
        is_permanent_failure = False
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if job.status in (JobStatus.CANCELLED, JobStatus.DONE, JobStatus.ERROR):
                return
            worker_id_to_clear = job.worker_id
            job.retry_count += 1
            if job.retry_count > 3:
                is_permanent_failure = True
                job.status = JobStatus.ERROR
                job.finished_at = time.time()
                job.error = f"[failed after {job.retry_count} retries] {error}"
            else:
                job.status = JobStatus.PENDING
                job.worker_id = None
                job.error = f"[retry {job.retry_count}] {error}"
                job.progress_percent = 0.0
                job.current_node_name = ""
                job.total_node_count = 0
                job.completed_node_count = 0
                job.started_at = None
            payload = job.to_dict()
        if worker_id_to_clear:
            worker = self._pool.get(worker_id_to_clear)
            if worker is not None and worker.current_job_id == job_id:
                worker.current_job_id = None
                await self._emit(
                    {
                        "type": "worker.updated",
                        "worker": WorkerView.from_info(worker.info()).to_dict(),
                    }
                )
        await self._store.save(payload)
        if is_permanent_failure:
            await self._store.save_event(
                job_id, "failed",
                worker_id=worker_id_to_clear,
                details={
                    "retryCount": job.retry_count,
                    "error": error,
                },
            )
            await self._emit({"type": "job.updated", "job": payload})
            async with self._lock:
                self._jobs.pop(job_id, None)
            self._wakeup.set()
        else:
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

    async def move_job(self, job_id: str, target_worker_id: str) -> JobResponse:
        """대기 중(pending)인 잡의 타겟 워커를 변경한다.
        Change the target worker of a pending job.

        동일한 worker_type의 워커만 지정할 수 있다.
        Only workers of the same worker_type can be assigned.

        Args:
            job_id: 이동할 잡 ID / ID of the job to move.
            target_worker_id: 새 타겟 워커 ID / New target worker ID.

        Returns:
            갱신된 잡 응답 / Updated job response.

        Raises:
            ValueError: 잡이 없거나, pending이 아니거나, 워커가 없거나, 타입 불일치 시.
                        If job not found, not pending, worker not found, or type mismatch.
        """
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise ValueError("job not found")
            if job.status != JobStatus.PENDING:
                raise ValueError("only pending jobs can be moved")
            target = self._pool.get(target_worker_id)
            if target is None:
                raise ValueError("target worker not found")
            if target.worker_type != (job.worker_type or "comfyui"):
                raise ValueError("worker type mismatch")
            job.target_worker_id = target_worker_id
            payload = job.to_dict()
            response = job.to_response()
        await self._store.save(payload)
        await self._store.save_event(
            job_id, "moved",
            worker_id=target_worker_id,
            details={"targetWorkerId": target_worker_id},
        )
        await self._emit({"type": "job.updated", "job": response.model_dump()})
        self._wakeup.set()
        return response
    async def _emit(self, event: NormalizedEvent | dict[str, JSONValue]) -> None:
        """정규화된 이벤트를 모든 구독 리스너에게 발행한다.
        Emit a normalized event to all subscribed listeners.

        dict가 전달되면 NormalizedEvent로 검증(validate) 후 발행한다.
        검증 실패 시 경고 로그를 남기고 무시한다.
        Validates dict input as NormalizedEvent before emitting.
        Logs a warning and skips if validation fails.
        """
        try:
            if isinstance(event, dict):
                validated_event = event_adapter.validate_python(event)
            else:
                validated_event = event
        except Exception:
            logger.exception("Failed to validate event schema: %s", event)
            return

        for listener in list(self._listeners):
            try:
                await listener(validated_event)
            except Exception:
                logger.exception("listener failed")

    # ---------- image persistence ----------

    async def _persist_image(
        self, job_id: str, worker: BaseWorker, img: dict[str, JSONValue]
    ) -> None:
        """ComfyUI 결과 이미지를 워커에서 다운로드하여 디스크에 영구 저장한다.
        Download a ComfyUI result image from the worker and persist it to disk.

        이미지 내용의 SHA-256 해시를 파일명으로 사용하여 중복을 방지한다.
        저장 후 DB에 이미지 레코드를 기록하고, 잡에 해시를 연결한다.
        Uses SHA-256 hash of image content as filename for deduplication.
        After saving, records the image in DB and links the hash to the job.

        Args:
            job_id: 이미지가 속한 잡 ID / ID of the job this image belongs to.
            worker: 이미지를 제공한 워커 / Worker that produced the image.
            img: ComfyUI 이미지 메타데이터 (filename, subfolder, type) / ComfyUI image metadata.
        """
        # A. 비동기 다운로드 시작 전에 즉시 메모리에서 잡 정보 캡처 (Race Condition 방지)
        async with self._lock:
            job_mem = self._jobs.get(job_id)
            if job_mem:
                original_filename = job_mem.filename
                prompt = job_mem.prompt
                meta = job_mem.meta
                ceg_template = job_mem.ceg_template
                workflow = job_mem.workflow
            else:
                original_filename = ""
                prompt = ""
                meta = {}
                ceg_template = ""
                workflow = ComfyWorkflow.model_validate({})

        filename = str(img.get("filename") or "")
        subfolder = str(img.get("subfolder") or "")
        type_ = str(img.get("type") or "output")
        if not filename:
            return
        ext = Path(filename).suffix.lower() or ".png"
        tmp_path = self._images_dir / f".tmp-{uuid.uuid4().hex}{ext}"
        hasher = hashlib.sha256()
        size = 0
        try:
            try:
                buffer = bytearray()
                async for chunk in worker.stream_output(
                    {"filename": filename, "subfolder": subfolder, "type": type_}
                ):
                    if not chunk:
                        continue
                    hasher.update(chunk)
                    buffer.extend(chunk)
                    size += len(chunk)

                def _write_and_replace() -> str:
                    with tmp_path.open("wb") as f:
                        f.write(buffer)
                    sha_val = hasher.hexdigest()
                    target_path = self._images_dir / f"{sha_val}{ext}"
                    if target_path.exists():
                        tmp_path.unlink(missing_ok=True)
                    else:
                        tmp_path.replace(target_path)
                    return sha_val

                sha = await asyncio.to_thread(_write_and_replace)
            except Exception:
                await asyncio.to_thread(tmp_path.unlink, missing_ok=True)
                raise

            # B. 시작 시점에 메모리에 없었다면 DB에서 조회 (Fallback)
            if not job_mem:
                job_db = await self._store.get_job(job_id)
                if job_db:
                    original_filename = str(job_db.get("filename") or "")
                    prompt = str(job_db.get("prompt") or "")
                    meta_val = job_db.get("meta")
                    meta = cast(dict[str, str], meta_val) if isinstance(meta_val, dict) else {}
                    ceg_template = str(job_db.get("cegTemplate") or "")
                    raw_wf = job_db.get("_workflow")
                    if isinstance(raw_wf, dict):
                        workflow = ComfyWorkflow.model_validate(raw_wf)
                    elif isinstance(raw_wf, ComfyWorkflow):
                        workflow = raw_wf
                    else:
                        workflow = ComfyWorkflow.model_validate({})

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
                meta=meta,
                ceg_template=ceg_template,
                workflow=workflow.model_dump(),
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
            # Update job with saved image hash so frontend can use /saved-images/{hash}
            async with self._lock:
                job = self._jobs.get(job_id)
                if job:
                    job.saved_image_hashes.append(sha)
                    payload = job.to_dict()
                else:
                    payload = None

            if payload:
                await self._store.save(payload)
                await self._emit({"type": "job.updated", "job": payload})
            else:
                # DB Fallback: update stored job with the new hash
                job_db = await self._store.get_job(job_id)
                if job_db:
                    hashes_val = job_db.get("savedImageHashes")
                    hashes = cast(list[str], hashes_val) if isinstance(hashes_val, list) else []
                    if sha not in hashes:
                        hashes.append(sha)
                        job_db["savedImageHashes"] = cast(JSONValue, hashes)
                        await self._store.save(job_db)
                        await self._emit({"type": "job.updated", "job": job_db})
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
    ) -> Optional[SavedImageResponse]:
        """저장된 이미지의 큐레이션 상태/노트를 업데이트한다.
        Update the curation status and/or note of a saved image.

        상태가 변경되면 curation_changed 이벤트를 기록한다.
        Records a curation_changed event if the status changes.

        Args:
            hash: 이미지 해시 / Image hash.
            status: 새 큐레이션 상태 (예: 'approved', 'trashed') / New curation status.
            note: 큐레이션 노트 / Curation note.

        Returns:
            업데이트된 이미지 응답 또는 None / Updated image response, or None if not found.
        """
        existing = await self._store.get_saved_image(hash)
        if existing is None:
            return None
        old_status = str(existing.get("status") or "")
        updated_dict = await self._store.update_curation(hash, status=status, note=note)
        if updated_dict is None:
            return None

        updated = SavedImageResponse.model_validate(updated_dict)
        if status is not None and status != old_status:
            await self._store.save_event(
                updated.jobId,
                "curation_changed",
                details={
                    "hash": hash,
                    "oldStatus": old_status,
                    "newStatus": status,
                },
            )
        await self._emit({"type": "image.curation", "image": cast(JSONValue, updated.model_dump())})
        return updated

    async def add_image_tags(self, hash: str, tags: list[str]) -> Optional[list[str]]:
        """저장된 이미지에 태그를 추가한다.
        Add tags to a saved image.

        Args:
            hash: 이미지 해시 / Image hash.
            tags: 추가할 태그 리스트 / List of tags to add.

        Returns:
            갱신된 전체 태그 리스트 또는 None / Updated full tag list, or None if image not found.
        """
        if await self._store.get_saved_image(hash) is None:
            return None
        result = await self._store.add_tags(hash, tags)
        await self._emit({"type": "image.curation", "hash": hash, "tags": cast(JSONValue, result)})
        return result

    async def auto_generate_image_tags(self, hash: str) -> Optional[list[str]]:
        """저장된 이미지에 대해 태그를 자동 생성한다.
        Auto-generate tags for a saved image.

        Args:
            hash: 이미지 해시 / Image hash.

        Returns:
            생성된 태그 리스트 또는 None / Generated tag list, or None if image not found.
        """
        if await self._store.get_saved_image(hash) is None:
            return None
        result = await self._store.auto_generate_tags(hash)
        if result is not None:
            await self._emit({"type": "image.curation", "hash": hash, "tags": cast(JSONValue, result)})
        return result

    async def bulk_auto_generate_image_tags(self, hashes: list[str]) -> dict[str, list[str]]:
        """여러 이미지에 대해 태그를 일괄 자동 생성한다.
        Auto-generate tags for multiple images in bulk.

        Args:
            hashes: 이미지 해시 리스트 / List of image hashes.

        Returns:
            해시별 태그 딕셔너리 / Dictionary mapping hashes to generated tag lists.
        """
        result = await self._store.bulk_auto_generate_tags(hashes)
        for h, tags in result.items():
            await self._emit({"type": "image.curation", "hash": h, "tags": cast(JSONValue, tags)})
        return result

    async def auto_generate_all_empty_image_tags(self) -> dict[str, list[str]]:
        """태그가 없는 모든 이미지에 대해 태그를 자동 생성한다.
        Auto-generate tags for all images that currently have no tags.

        Returns:
            해시별 태그 딕셔너리 / Dictionary mapping hashes to generated tag lists.
        """
        result = await self._store.auto_generate_all_empty_tags()
        for h, tags in result.items():
            await self._emit({"type": "image.curation", "hash": h, "tags": cast(JSONValue, tags)})
        return result

    async def remove_image_tag(self, hash: str, tag: str) -> Optional[list[str]]:
        """저장된 이미지에서 특정 태그를 제거한다.
        Remove a specific tag from a saved image.

        Args:
            hash: 이미지 해시 / Image hash.
            tag: 제거할 태그 / Tag to remove.

        Returns:
            갱신된 전체 태그 리스트 또는 None / Updated full tag list, or None if image not found.
        """
        if await self._store.get_saved_image(hash) is None:
            return None
        result = await self._store.remove_tag(hash, tag)
        await self._emit({"type": "image.curation", "hash": hash, "tags": cast(JSONValue, result)})
        return result

    async def empty_trash(self) -> int:
        """'trashed' 상태의 이미지를 디스크 파일과 DB에서 영구 삭제한다.
        Permanently delete disk files and DB records of images with 'trashed' status.

        Returns:
            삭제된 이미지 수 / Number of images deleted.
        """
        targets = await self._store.list_trashed_for_purge()
        deleted = 0
        for item in targets:
            hash_val = str(item["hash"])
            ext = str(item.get("extension") or ".png")
            path = self._images_dir / f"{hash_val}{ext}"
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.warning("failed to unlink trashed image %s", path)
            if await self._store.delete_saved_image(hash_val):
                deleted += 1
                await self._emit({"type": "image.deleted", "hash": hash_val})
        return deleted




# ---------- image upload helpers ----------

_UPLOAD_MARKER_RE = re.compile(r"^__upload__([a-f0-9]{64})\.(png|jpg|jpeg|webp)$")


async def _resolve_image_markers(
    workflow: ComfyWorkflow,
    image_uploads: dict[str, dict[str, str]],
    worker: BaseWorker,
) -> ComfyWorkflow:
    """워크플로우에서 __upload__{hash}.{ext} 마커를 찾아 워커로 업로드 후 실제 파일명으로 치환한다.
    Finds __upload__{hash}.{ext} markers in the workflow, uploads the corresponding
    images to the worker, and replaces the markers with actual filenames.

    디스패치 전에 사용자가 업로드한 이미지를 ComfyUI 워커로 전송하기 위한 헬퍼.
    Helper for sending user-uploaded images to a ComfyUI worker before dispatch.

    Args:
        workflow: 마커를 포함한 원본 워크플로우 / Original workflow containing markers.
        image_uploads: 해시 → 메타데이터 매핑 / Hash → metadata mapping for uploads.
        worker: 이미지를 업로드할 대상 워커 / Target worker to upload images to.

    Returns:
        마커가 치환된 깊은 복사 워크플로우 / Deep-copied workflow with markers replaced.
    """
    import copy

    resolved = copy.deepcopy(workflow)
    uploaded: dict[str, str] = {}

    for node in resolved.root.values():
        for key, value in list(node.inputs.items()):
            if not isinstance(value, str):
                continue
            m = _UPLOAD_MARKER_RE.match(value)
            if not m:
                continue
            sha, ext = m.group(1), m.group(2)
            if sha in uploaded:
                node.inputs[key] = uploaded[sha]
                continue
            meta = image_uploads.get(sha)
            if meta is None:
                logger.warning(
                    "image marker %s found but not in imageUploads, skipping", sha
                )
                continue
            src = UPLOAD_IMAGES_DIR / f"{sha}.{ext}"
            if not src.exists():
                src = UPLOAD_IMAGES_DIR / f"{sha}.png"
            if not src.exists():
                logger.warning(
                    "image file %s not found on disk, skipping upload", sha
                )
                continue
            try:
                name = await worker.upload_image(
                    file_data=src.read_bytes(),
                    filename=meta.get("filename", f"{sha}.{ext}"),
                )
                node.inputs[key] = name
                uploaded[sha] = name
            except Exception:
                logger.exception(
                    "failed to upload image %s to worker %s", sha, worker.id
                )

    return resolved
