"""
잡 관련 Pydantic 요청 모델.
server.py ↔ jobs.py 순환 임포트 해결을 위해 분리됨.
"""
from __future__ import annotations

from enum import StrEnum, auto
from typing import Dict, Optional, Literal, Union

from pydantic import BaseModel, Field, AliasChoices

from backend.src.workflow_models import ComfyWorkflow

type JSONValue = str | int | float | bool | None | list[JSONValue] | dict[str, JSONValue]


class WorkerType(StrEnum):
    """
    Represents the backend engine type of a worker in the pool.
    워커 풀 내에서 작동하는 개별 워커의 실행 백엔드 엔진 종류를 정의하는 열거형 클래스입니다.
    """
    COMFYUI = auto()
    NAI = auto()


class JobStatus(StrEnum):
    """
    Defines the current execution status of a background rendering job.
    백그라운드에서 실행되는 이미지 렌더링 작업(Job)의 진행 상태 단계를 정의합니다.
    """
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    CANCELLED = "cancelled"


class JobItem(BaseModel):
    """
    Request model containing the initial parameters needed to create and run a new render job.
    새로운 이미지 생성 작업을 등록하고 시작할 때 필요한 핵심 정보를 담는 요청 모델 클래스입니다.
    """
    filename: str
    prompt: str
    workflow: ComfyWorkflow | None = Field(default=None, validation_alias=AliasChoices("workflow", "_workflow"))
    workerType: WorkerType
    meta: Dict[str, str] = Field(default_factory=dict)
    cegTemplate: str = ""
    imageUploads: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    workerId: Optional[str] = Field(None, description="타겟 워커 ID (None이면 자동 배분)")


class JobResponse(BaseModel):
    """
    API response model that provides complete execution progress and results for a job.
    작업의 현재 진행 상황, 할당된 워커, 결과 이미지 등 모든 상세 정보를 전달하는 API 응답 모델 클래스입니다.
    """
    id: str
    filename: str
    prompt: str
    workflow: ComfyWorkflow = Field(..., validation_alias=AliasChoices("workflow", "_workflow"))
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
    """
    API response model displaying the connectivity and processing state of a worker.
    현재 등록되어 작동 중인 개별 워커의 네트워크 연결 상태 및 실시간 활성 정보를 나타내는 응답 모델 클래스입니다.
    """
    id: str
    url: str
    alive: bool
    busy: bool
    currentJobId: Optional[str] = None
    workerType: str


class DiagnosticsSnapshotResponse(BaseModel):
    """
    API response model capturing a system-wide diagnostic overview of queues and tasks.
    시스템 전체의 대기열, 백그라운드 태스크, 디스패처 상태 등 진단 정보를 일목요연하게 보여주는 스냅샷 응답 모델 클래스입니다.
    """
    jobsTotal: int
    jobsByStatus: dict[str, int]
    listeners: int
    persistTasks: int
    dispatcherTaskDone: Optional[bool] = None
    stopping: bool
    paused: bool


class JobQueryResponse(BaseModel):
    """
    API response model returning pagination details alongside a list of matching jobs.
    조건에 맞게 필터링된 작업 목록과 페이지네이션 메타데이터를 함께 담아 전달하는 API 응답 모델 클래스입니다.
    """
    total: int
    items: list[JobResponse]
    limit: int
    offset: int


class BaseEvent(BaseModel):
    """
    Abstract base schema for all server-sent real-time WebSocket events.
    서버에서 클라이언트로 실시간 전송되는 웹소켓 이벤트의 공통 속성을 정의하는 기본 모델 클래스입니다.
    """
    type: str


class JobCreatedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted immediately when a new render job is submitted.
    새로운 이미지 생성 작업이 대기열에 무사히 생성 및 등록되었을 때 전송되는 실시간 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["job.created"]
    job: JobResponse


class JobUpdatedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when a job's progress, status, or logs change.
    작업의 상태 변화, 렌더링 노드 전환 및 진행률 변경 정보를 실시간으로 알리는 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["job.updated"]
    job: JobResponse


class JobDeletedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when an existing job is removed from the manager.
    대기열 혹은 보관함에서 특정 작업이 삭제되었음을 클라이언트에 실시간으로 공유하는 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["job.deleted"]
    jobId: str


class ControlUpdatedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when the global dispatcher control settings change.
    작업 분배 일시 정지(Pause) 등 시스템 전체 제어 상태의 변경 알림을 전달하는 실시간 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["control.updated"]
    paused: bool


class WorkerAddedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when a new generation worker registers to the pool.
    새로운 이미지 생성 워커가 시스템 풀에 연결 및 등록되었을 때 실시간으로 전송되는 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["worker.added"]
    worker: WorkerViewResponse


class WorkerRemovedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when an active worker disconnects or is deleted.
    기존에 작동하던 워커의 접속이 해제되거나 제거되었음을 알리는 실시간 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["worker.removed"]
    workerId: str


class WorkerUpdatedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when a worker's status (busy, alive, active job) changes.
    워커의 활성화 여부나 현재 작업 처리량 변화 등 상태의 최신 정보를 클라이언트에 알리는 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["worker.updated"]
    worker: WorkerViewResponse


class WorkerPreviewEvent(BaseEvent):
    """
    Real-time WebSocket event carrying a generation preview payload from a worker.
    워커가 렌더링 중인 임시 진행 상황 프리뷰 이미지를 실시간으로 화면에 갱신하기 위해 발행되는 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["worker.preview"]
    workerId: str


class ImageSavedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when a render result image is persisted on disk and database.
    생성이 완료된 결과 이미지가 스토리지와 데이터베이스에 성공적으로 안전하게 저장되었음을 나타내는 실시간 이벤트 클래스입니다.
    """
    type: Literal["image.saved"]
    jobId: str
    hash: str
    extension: str
    sizeBytes: int
    originalFilename: str
    status: str


class SavedImageResponse(BaseModel):
    """
    API response model returning the detailed file metadata, tag lists, and status of a saved image.
    저장된 결과 이미지의 디렉토리 정보, 크기, 태그 목록 및 즐겨찾기 상태 등을 상세히 전달하는 API 응답 모델 클래스입니다.
    """
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
    workflow: ComfyWorkflow = Field(..., validation_alias=AliasChoices("workflow", "_workflow"))
    trashedAt: Optional[float] = None
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, str] = Field(default_factory=dict)


class SavedImagesListResponse(BaseModel):
    """
    API response model containing a paginated slice of curated, saved images.
    사용자가 생성하여 보관 중인 이미지 목록을 페이지네이션 정보와 함께 안전하게 전송하는 API 응답 모델 클래스입니다.
    """
    items: list[SavedImageResponse]
    limit: int
    offset: int
    total: int


class JobSavedImagesResponse(BaseModel):
    """
    API response model returning all images produced under a single, specific parent render job.
    단일 이미지 생성 작업(Job)에서 생성되어 저장된 결과 이미지들의 그룹 목록을 반환하는 API 응답 모델 클래스입니다.
    """
    jobId: str
    items: list[SavedImageResponse]


class ImageCurationEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when an image is curated (starred, trashed, or tagged).
    저장된 이미지의 큐레이션 상태(보관/휴지통 등) 또는 태그 조합이 변경되었을 때 실시간으로 통보하는 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["image.curation"]
    image: Optional[SavedImageResponse] = None
    hash: Optional[str] = None
    tags: Optional[list[str]] = None


class ImageDeletedEvent(BaseEvent):
    """
    Real-time WebSocket event broadcasted when a saved image record is permanently destroyed.
    저장소에서 파일과 데이터베이스 레코드가 최종적으로 완전히 영구 삭제되었을 때 알림을 주는 실시간 웹소켓 이벤트 클래스입니다.
    """
    type: Literal["image.deleted"]
    hash: str


class SnapshotWorker(BaseModel):
    """
    Simplified worker model representing status within a complete system snapshot.
    전체 시스템 스냅샷 캡처 시, 개별 워커의 활성 및 유휴 상태 정보를 가볍게 축약하여 표현하는 데이터 모델 클래스입니다.
    """
    id: str
    url: str
    alive: bool
    busy: bool
    currentJobId: Optional[str] = None


class SnapshotEvent(BaseModel):
    """
    System-wide snapshot event that captures all jobs and workers for UI synchronization.
    화면 초기 접속 또는 대폭적인 갱신 시, 현재 큐에 있는 모든 작업과 활성화된 모든 워커의 상태를 일괄 동기화하는 이벤트 클래스입니다.
    """
    type: Literal["snapshot"]
    jobs: list[JobResponse]
    workers: list[SnapshotWorker]
    paused: bool


class SettingsUpdatedEvent(BaseModel):
    """
    WebSocket event broadcasted when system-wide dynamic settings are updated by a sender.
    시스템의 특정 전역 설정 값이 변경되었음을 알리는 이벤트로, 변경을 발생시킨 전송자 정보와 키-밸류를 공유하는 이벤트 클래스입니다.
    """
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