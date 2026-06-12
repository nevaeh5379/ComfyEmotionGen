"""
잡 관련 Pydantic 요청 모델.
server.py ↔ jobs.py 순환 임포트 해결을 위해 분리됨.
"""
from __future__ import annotations

from enum import StrEnum, auto
from typing import Dict, Optional, Literal, Union

from pydantic import BaseModel, Field

from backend.src.workflow_models import ComfyWorkflow

type JSONValue = str | int | float | bool | None | list[JSONValue] | dict[str, JSONValue]


class WorkerType(StrEnum):
    COMFYUI = auto()
    NAI = auto()


class JobStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    CANCELLED = "cancelled"


class JobItem(BaseModel):
    filename: str
    prompt: str
    workflow: ComfyWorkflow | None
    workerType: WorkerType
    meta: Dict[str, str] = Field(default_factory=dict)
    cegTemplate: str = ""
    imageUploads: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    workerId: Optional[str] = Field(None, description="타겟 워커 ID (None이면 자동 배분)")


class JobResponse(BaseModel):
    id: str
    filename: str
    prompt: str
    workflow: ComfyWorkflow
    status: JobStatus
    createdAt: float
    workerId: Optional[str] = None
    error: Optional[str] = None
    imageUrls: list[str] = Field(default_factory=list)
    savedImageHashes: list[str] = Field(default_factory=list)
    progressPercent: float = 0.0
    currentNodeName: str = ""
    totalNodeCount: int = 0
    completedNodeCount: int = 0
    startedAt: Optional[float] = None
    finishedAt: Optional[float] = None
    retryCount: int = 0
    executionDurationMs: Optional[float] = None
    meta: dict[str, str] = Field(default_factory=dict)
    cegTemplate: str = ""
    imageUploads: dict[str, dict[str, str]] = Field(default_factory=dict)
    workerType: Optional[str] = None
    targetWorkerId: Optional[str] = None


class WorkerViewResponse(BaseModel):
    id: str
    url: str
    alive: bool
    busy: bool
    currentJobId: Optional[str] = None
    workerType: str


class DiagnosticsSnapshotResponse(BaseModel):
    jobsTotal: int
    jobsByStatus: dict[str, int]
    listeners: int
    persistTasks: int
    dispatcherTaskDone: Optional[bool] = None
    stopping: bool
    paused: bool


class JobQueryResponse(BaseModel):
    total: int
    items: list[JobResponse]
    limit: int
    offset: int


class BaseEvent(BaseModel):
    type: str


class JobCreatedEvent(BaseEvent):
    type: Literal["job.created"]
    job: JobResponse


class JobUpdatedEvent(BaseEvent):
    type: Literal["job.updated"]
    job: JobResponse


class JobDeletedEvent(BaseEvent):
    type: Literal["job.deleted"]
    jobId: str


class ControlUpdatedEvent(BaseEvent):
    type: Literal["control.updated"]
    paused: bool


class WorkerAddedEvent(BaseEvent):
    type: Literal["worker.added"]
    worker: WorkerViewResponse


class WorkerRemovedEvent(BaseEvent):
    type: Literal["worker.removed"]
    workerId: str


class WorkerUpdatedEvent(BaseEvent):
    type: Literal["worker.updated"]
    worker: WorkerViewResponse


class WorkerPreviewEvent(BaseEvent):
    type: Literal["worker.preview"]
    workerId: str


class ImageSavedEvent(BaseEvent):
    type: Literal["image.saved"]
    jobId: str
    hash: str
    extension: str
    sizeBytes: int
    originalFilename: str
    status: str


class SavedImageResponse(BaseModel):
    hash: str
    jobId: str
    originalFilename: str
    comfyFilename: str
    subfolder: str
    type: str
    workerId: str
    extension: str
    sizeBytes: int
    prompt: str
    createdAt: float
    status: str
    note: str
    workflow: ComfyWorkflow
    trashedAt: Optional[float] = None
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, str] = Field(default_factory=dict)


class SavedImagesListResponse(BaseModel):
    items: list[SavedImageResponse]
    limit: int
    offset: int
    total: int


class JobSavedImagesResponse(BaseModel):
    jobId: str
    items: list[SavedImageResponse]


class ImageCurationEvent(BaseEvent):
    type: Literal["image.curation"]
    image: Optional[SavedImageResponse] = None
    hash: Optional[str] = None
    tags: Optional[list[str]] = None


class ImageDeletedEvent(BaseEvent):
    type: Literal["image.deleted"]
    hash: str


class SnapshotWorker(BaseModel):
    id: str
    url: str
    alive: bool
    busy: bool
    currentJobId: Optional[str] = None


class SnapshotEvent(BaseModel):
    type: Literal["snapshot"]
    jobs: list[JobResponse]
    workers: list[SnapshotWorker]
    paused: bool


class SettingsUpdatedEvent(BaseModel):
    type: Literal["settings.updated"]
    key: str
    value: Optional[str] = None
    sender: str


NormalizedEvent = Union[
    JobCreatedEvent,
    JobUpdatedEvent,
    JobDeletedEvent,
    ControlUpdatedEvent,
    WorkerAddedEvent,
    WorkerRemovedEvent,
    WorkerUpdatedEvent,
    WorkerPreviewEvent,
    ImageSavedEvent,
    ImageCurationEvent,
    ImageDeletedEvent,
    SnapshotEvent,
    SettingsUpdatedEvent,
]