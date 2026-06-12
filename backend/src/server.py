"""
백엔드 서버.

역할:
    1) DSL 파서 서버 — POST /render, POST /workflow/inject (디버그/미리보기)
    2) ComfyUI 중계 서버 — 워커 풀(=GPU별 ComfyUI 인스턴스) 관리,
       잡 큐 디스패치, 이미지 프록시, WebSocket 이벤트 브로드캐스트

엔드포인트:
    GET  /health                       - 백엔드 + 워커 풀 상태
    POST /render                       - DSL 템플릿 → 프롬프트 리스트
    POST /workflow/inject              - 워크플로우에 프롬프트 주입
    POST /jobs                         - 잡 N개 등록 (프론트가 시드/치환 박은 워크플로우 제출)
    GET  /jobs                         - 잡 목록 (선택적 필터: status,filename,limit,offset)
    DELETE /jobs/{id}                  - 잡 취소
    GET  /images/{worker_id}/view      - ComfyUI view 프록시 (실시간)
    GET  /saved-images                 - 디스크 영속화된 이미지 목록 (필터: status,tag,filename,job_id)
    GET  /saved-images/{hash}          - 영속 이미지 바이트 서빙
    GET  /saved-images/{hash}/meta     - 메타데이터만
    PATCH /saved-images/{hash}         - 큐레이션 (status/note)
    POST /saved-images/{hash}/tags     - 태그 추가
    DELETE /saved-images/{hash}/tags/{tag} - 태그 제거
    POST /saved-images/{hash}/restore  - 휴지통 → pending
    GET  /tags                         - 태그별 사용 카운트
    GET  /trash                        - 휴지통 목록
    POST /trash/empty                  - 휴지통 비우기 (디스크/DB 영구 삭제)
    GET  /asset-groups                 - filename별 후보군 집계
    GET  /asset-groups/{filename}      - 그룹 내 이미지 전체

    POST /export                       - 큐레이션 결과 zip 다운로드
    GET  /jobs/{id}/saved-images       - 특정 잡이 만든 영속 이미지 목록
    GET  /object_info                  - ComfyUI 노드 정의 (object_info.json)
    GET  /workers                      - 워커 스냅샷
    POST /workers                      - 새 ComfyUI 워커 URL 등록
    DELETE /workers/{id}               - 워커 제거 (force=true로 활성 잡 강제 취소)
    WS   /ws/events                    - 정규화 이벤트 스트림
"""

from __future__ import annotations

import asyncio
import gc
import hashlib
import io
import json
import logging
import mimetypes
import zipfile
import os
import tracemalloc
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Literal, Optional, Union, AsyncGenerator

from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.src.prompt_dsl import DSLSyntaxError, parse, render, inject_into_workflow
from backend.src.worker_pool import DEFAULT_COMFYUI_URL, WorkerPool, read_env_worker_urls
from backend.src.jobs import ActiveJobError, JobManager, DEFAULT_IMAGES_DIR, UPLOAD_IMAGES_DIR
from backend.src.job_store import JobStore
from backend.src.webhook import WebhookService, WEBHOOK_EVENTS
from backend.src._version import BACKEND_VERSION, BUNDLE_VERSION, COMMIT
from backend.src.models import (
    JobItem,
    NormalizedEvent,
    JobUpdatedEvent,
    JobStatus,
    SnapshotWorker,
    SnapshotEvent,
    SettingsUpdatedEvent,
    SavedImageResponse,
    SavedImagesListResponse,
    JobSavedImagesResponse,
    JSONValue,
    JobQueryResponse,
    WorkerViewResponse,
    JobResponse,
)

logger = logging.getLogger(__name__)

try:
    import resource
except ImportError:  # pragma: no cover - Windows portable builds
    resource = None  # type: ignore[assignment]


# ====== 전역 상태 (lifespan에서 초기화) ======

worker_pool: WorkerPool
job_manager: JobManager
webhook_service: WebhookService
ws_clients: set[WebSocket] = set()

if os.environ.get("CEG_MEMORY_DEBUG") == "1":
    tracemalloc.start()


async def broadcast(event: NormalizedEvent) -> None:
    """모든 연결된 WebSocket 클라이언트에게 정규화된 이벤트를 브로드캐스트한다.
    전송 실패한 클라이언트는 자동으로 목록에서 제거한다.

    Broadcast a normalized event to all connected WebSocket clients.
    Clients that fail to receive are automatically removed from the set.
    """
    event_dict = event.model_dump()
    dead: list[WebSocket] = []
    for ws in list(ws_clients):
        try:
            await ws.send_json(event_dict)
        except Exception as exc:
            logger.warning("WebSocket broadcast 실패, 클라이언트 제거: %s", exc)
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)


# ====== Pydantic 모델 ======


class RenderRequest(BaseModel):
    """DSL 템플릿 렌더링 요청 모델.
    프론트엔드가 CEG 템플릿을 보내면, 축(axis) 조합에 따라 프롬프트 리스트를 생성한다.

    Request model for DSL template rendering.
    The frontend sends a CEG template, and the server generates prompt lists
    based on axis combinations.
    """
    template: str = Field(..., description="CEG 템플릿 소스")
    only: Optional[Dict[str, List[str]]] = Field(None, description="특정 axis 값만 포함 (예: {\"emotion\": [\"happy\",\"sad\"]})")
    fix: Optional[Dict[str, str]] = Field(None, description="특정 axis를 단일 값으로 고정 (예: {\"emotion\": \"happy\"})")
    skip_excludes: bool = Field(False, description="DSL 내 exclude 규칙 무시")
    extra_excludes: Optional[List[Dict[str, JSONValue]]] = Field(None, description="추가 제외 규칙")
    limit: int = Field(0, ge=0, description="페이지 크기 (0=전체)")
    offset: int = Field(0, ge=0, description="오프셋")


class ExcludeConditionIn(BaseModel):
    """제외 조건 입력 모델. 특정 축(axis)에 대한 필터링 조건 하나를 표현한다.

    Input model for an exclude condition. Represents a single filter condition
    on a specific axis (e.g., axis='emotion', op='eq', values=['happy']).
    """
    axis: str
    op: Literal["eq", "in", "not_in"] = "eq"
    values: List[str]


class ExcludeRuleIn(BaseModel):
    """제외 규칙 입력 모델. 여러 조건을 AND/OR로 결합하여 제외 패턴을 정의한다.

    Input model for an exclude rule. Combines multiple conditions with AND/OR
    connective to define an exclusion pattern.
    """
    conditions: List[ExcludeConditionIn]
    connective: Literal["AND", "OR"] = "AND"


class AxisValueOut(BaseModel):
    """축 값 출력 모델. 렌더링 결과에서 각 축의 개별 값과 부가 속성을 담는다.

    Output model for an axis value. Contains a single value of an axis
    along with its additional properties from the DSL.
    """
    key: str
    value: str
    props: Dict[str, str] = {}


class AxisOut(BaseModel):
    """축(axis) 출력 모델. DSL에서 정의된 축 전체 정보를 담는다.

    Output model for an axis definition. Contains all values and
    optional include path from the DSL template.
    """
    include: Optional[str] = None
    values: List[AxisValueOut]


class ExcludeConditionOut(BaseModel):
    """제외 조건 출력 모델. 렌더링 응답에서 적용된 제외 조건을 표현한다.

    Output model for an exclude condition in the render response.
    Shows which conditions were applied during rendering.
    """
    axis: str
    op: str
    values: List[str]


class ExcludeRuleOut(BaseModel):
    """제외 규칙 출력 모델. 렌더링 응답에서 적용된 제외 규칙 전체를 표현한다.

    Output model for an exclude rule in the render response.
    Shows the complete exclusion rule that was applied.
    """
    conditions: List[ExcludeConditionOut]
    connective: str = "AND"


class RenderItem(BaseModel):
    """렌더링 결과 항목. 축 조합에서 생성된 개별 파일명, 프롬프트, 메타데이터를 담는다.

    A single rendered item. Contains the filename, prompt text, and metadata
    generated from a specific axis value combination.
    """
    filename: str
    prompt: str
    meta: Dict[str, str]


class RenderResponse(BaseModel):
    """DSL 렌더링 응답 모델. 생성된 프롬프트 목록, 축 정보, 제외 규칙 등을 포함한다.
    POST /render 엔드포인트에서 사용된다.

    Response model for DSL rendering. Contains the list of generated prompts,
    axis definitions, exclude rules, and template structure.
    Used by the POST /render endpoint.
    """
    count: int
    items: List[RenderItem]
    axes: Dict[str, AxisOut] = {}
    sets: Dict[str, str] = {}
    excludes: List[ExcludeRuleOut] = []
    template_structure: List[Dict[str, JSONValue]] = []


class InjectRequest(BaseModel):
    """워크플로우 프롬프트 주입 요청 모델.
    ComfyUI 워크플로우 JSON에 프롬프트 텍스트를 플레이스홀더 위치에 삽입한다.

    Request model for workflow prompt injection.
    Injects prompt text into a ComfyUI workflow JSON at placeholder positions.
    Used by POST /workflow/inject.
    """
    workflow: Dict[str, JSONValue]
    prompt: Union[str, Dict[str, str]] = Field(
        ..., description="문자열 또는 {placeholder: value} 매핑"
    )
    placeholder: str = "{{input}}"



class SessionMarker(BaseModel):
    """세션 마커 모델. 프론트엔드에서 세션 구간을 식별하기 위한 타임스탬프 마커.

    Session marker model. A timestamp marker used by the frontend to identify
    session boundaries for grouping jobs by session.
    """
    id: str
    startAt: int
    label: str


class ActiveState(BaseModel):
    """현재 활성 세션 상태. 가장 최근에 활성화된 세션의 ID와 시작 시점을 담는다.

    Active session state. Contains the ID and activation timestamp
    of the currently active session.
    """
    activeSessionId: str
    activatedAt: int


class SessionStatsRequest(BaseModel):
    """세션별 잡 통계 요청 모델. 세션 마커 기반으로 각 세션에 속한 잡 수를 집계한다.

    Request model for per-session job statistics. Aggregates job counts
    per session based on session markers and timestamps.
    Used by POST /jobs/session-stats.
    """
    markers: List[SessionMarker]
    activeState: Optional[ActiveState] = None
    selectedSessionId: str


class JobsCreateRequest(BaseModel):
    """잡 생성 요청 모델. 프론트엔드가 시드/프롬프트가 주입된 워크플로우를 N개 제출한다.

    Request model for creating jobs. The frontend submits N workflows
    with seeds/prompts already injected. Used by POST /jobs.
    """
    items: List[JobItem]


class CurationPatch(BaseModel):
    """큐레이션 패치 모델. 저장된 이미지의 상태(승인/거절/휴지통)나 메모를 수정한다.

    Curation patch model. Updates the status (approved/rejected/trashed)
    or note of a saved image. Used by PATCH /saved-images/{hash}.
    """
    status: Optional[Literal["pending", "approved", "rejected", "trashed"]] = None
    note: Optional[str] = None


class TagsAddRequest(BaseModel):
    """태그 추가 요청 모델. 저장된 이미지에 태그를 추가한다.

    Request model for adding tags to a saved image.
    Used by POST /saved-images/{hash}/tags.
    """
    tags: List[str]


class BulkAutoTagsRequest(BaseModel):
    """대량 자동 태그 생성 요청 모델. 여러 이미지 해시에 대해 자동 태그를 일괄 생성한다.

    Bulk auto-tag generation request. Generates automatic tags
    for multiple images by their hashes.
    Used by POST /saved-images/auto-tags/bulk.
    """
    hashes: List[str]


class ExportRequest(BaseModel):
    """데이터셋 익스포트 요청 모델. 큐레이션된 이미지를 ZIP으로 내보낸다.
    상태, 파일명, 태그로 필터링 가능하며, 중복 파일명 전략을 선택할 수 있다.

    Dataset export request model. Exports curated images as a ZIP archive.
    Supports filtering by status, filenames, and tags.
    Duplicate filename strategy: 'hash' appends hash suffix, 'number' appends counter.
    Used by POST /export.
    """
    status: Optional[Literal["pending", "approved", "rejected", "trashed"]] = "approved"
    filenames: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    duplicateStrategy: Literal["hash", "number"] = "hash"

class JobsDeleteRequest(BaseModel):
    """잡 일괄 삭제 요청 모델. 여러 잡을 DB와 메모리에서 영구 삭제한다.

    Batch job deletion request. Permanently removes multiple jobs
    from both the database and in-memory state.
    Used by POST /jobs/delete.
    """
    job_ids: list[str] = Field(..., min_length=1, description="삭제할 잡 ID 목록")
class WorkerCreateRequest(BaseModel):
    """워커 생성 요청 모델. 새 ComfyUI(또는 다른 백엔드) 워커 URL을 풀에 등록한다.

    Worker creation request. Registers a new ComfyUI (or other backend)
    worker URL to the worker pool. Used by POST /workers.
    """
    url: str = Field(..., description="워커 서버 URL (http://host:port)")
    worker_type: str = Field("comfyui", description="워커 백엔드 타입 (comfyui, nai, ...)")
class JobMoveRequest(BaseModel):
    """잡 워커 이동 요청 모델. 대기 중인 잡을 다른 워커로 재배정한다.

    Job worker move request. Reassigns a queued job to a different worker.
    Only same worker_type transfers are allowed.
    Used by POST /jobs/{job_id}/move.
    """
    targetWorkerId: str = Field(..., description="이동할 대상 워커 ID")


class WorkerCreateResponse(BaseModel):
    """워커 생성 응답 모델. 새로 등록된 워커의 상세 정보를 반환한다.

    Worker creation response. Returns detailed info about the newly registered worker.
    """
    worker: WorkerViewResponse


class JobMoveResponse(BaseModel):
    """잡 이동 응답 모델. 이동 성공 여부와 업데이트된 잡 정보를 반환한다.

    Job move response. Returns success status and the updated job information.
    """
    ok: bool
    job: JobResponse


class JobEventsResponse(BaseModel):
    """잡 이벤트 응답 모델. 특정 잡의 상태 전환 이력(audit log)을 반환한다.

    Job events response. Returns the state transition history (audit log)
    for a specific job. Used by GET /jobs/{job_id}/events.
    """
    jobId: str
    events: list[dict[str, JSONValue]]


class JobExecutionEventsResponse(BaseModel):
    """잡 실행 이벤트 응답 모델. 특정 잡의 ComfyUI 실행 이벤트를 반환한다.

    Job execution events response. Returns ComfyUI execution events
    for a specific job (progress, node outputs, etc.).
    Used by GET /jobs/{job_id}/execution-events.
    """
    jobId: str
    events: list[dict[str, JSONValue]]


class LogsResponse(BaseModel):
    """로그 응답 모델. 필터링된 전체 잡 이벤트 로그를 페이지네이션과 함께 반환한다.

    Logs response model. Returns filtered job event logs with pagination.
    Used by GET /logs.
    """
    events: list[dict[str, JSONValue]]
    limit: int
    offset: int


class TrashListResponse(BaseModel):
    """휴지통 목록 응답 모델. 'trashed' 상태의 이미지 목록을 페이지네이션과 함께 반환한다.

    Trash list response model. Returns images with 'trashed' status
    with pagination. Used by GET /trash.
    """
    items: list[dict[str, JSONValue]]
    limit: int
    offset: int


class AssetGroupsListResponse(BaseModel):
    """에셋 그룹 목록 응답 모델. 파일명(filename)별로 이미지를 그룹화한 목록을 반환한다.

    Asset groups list response. Returns images grouped by filename
    with pagination and sort order. Used by GET /asset-groups.
    """
    groups: list[dict[str, JSONValue]]
    limit: int
    offset: int
    sort: str


class AssetGroupDetailResponse(BaseModel):
    """에셋 그룹 상세 응답 모델. 특정 파일명 그룹에 속한 모든 이미지를 반환한다.

    Asset group detail response. Returns all images belonging to
    a specific filename group. Used by GET /asset-groups/{filename}.
    """
    filename: str
    items: list[dict[str, JSONValue]]


class WebhookConfigResponse(BaseModel):
    """웹훅 설정 응답 모델. 개별 웹훅 채널의 설정 정보를 담는다.

    Webhook config response. Contains configuration details for
    a single webhook channel (Discord, Telegram, or generic).
    """
    id: str
    name: str
    channel_type: str
    url: str
    events: list[str]
    enabled: bool
    include_image: bool


class WebhooksListResponse(BaseModel):
    """웹훅 목록 응답 모델. 등록된 모든 웹훅 설정을 반환한다.

    Webhooks list response. Returns all registered webhook configurations.
    Used by GET /webhooks.
    """
    configs: list[WebhookConfigResponse]


class WebhookDetailResponse(BaseModel):
    """웹훅 상세 응답 모델. 단일 웹훅 설정을 반환한다.

    Webhook detail response. Returns a single webhook configuration.
    Used by POST /webhooks and PUT /webhooks/{config_id}.
    """
    config: WebhookConfigResponse


class WorkerHealthInfo(BaseModel):
    """워커 상태 정보 모델. 개별 ComfyUI 워커의 건강/활동 상태를 담는다.

    Worker health info model. Contains the health and activity status
    of an individual ComfyUI worker instance.
    Used in /health and /workers responses.
    """
    id: str
    url: str
    alive: bool
    busy: bool
    currentJobId: Optional[str] = None
    workerType: str = "comfyui"


class HealthResponse(BaseModel):
    """헬스체크 응답 모델. 백엔드 상태와 모든 워커의 상태를 반환한다.

    Health check response. Returns backend status and health info
    for all registered workers. Used by GET /health.
    """
    backend: str
    workers: list[WorkerHealthInfo]


class WorkersListResponse(BaseModel):
    """워커 목록 응답 모델. 등록된 모든 워커의 상태 스냅샷을 반환한다.

    Workers list response. Returns a snapshot of all registered workers.
    Used by GET /workers.
    """
    workers: list[WorkerHealthInfo]


class InjectResponse(BaseModel):
    """워크플로우 주입 응답 모델. 프롬프트가 주입된 워크플로우 JSON을 반환한다.

    Workflow inject response. Returns the workflow JSON
    with prompts injected at placeholder positions.
    Used by POST /workflow/inject.
    """
    workflow: dict[str, JSONValue]


class SessionStatsResponse(BaseModel):
    """세션 통계 응답 모델. 세션별 잡 수와 선택된 세션의 상태별 카운트를 반환한다.

    Session statistics response. Returns job counts per session
    and status breakdown for the selected session.
    Used by POST /jobs/session-stats.
    """
    sessionJobCounts: dict[str, int]
    selectedSessionCounts: dict[str, int]

# ====== lifespan ======


async def _resolve_initial_worker_urls(store: JobStore) -> list[str]:
    """초기 워커 URL 목록을 결정한다: DB → (비어 있으면) env → (그래도 비어 있으면) DEFAULT 시드.
    이후 추가/삭제는 DB가 권위. env는 첫 부팅 시 seed로만 사용.

    Resolve initial worker URLs on startup: DB → env → DEFAULT seed.
    After first boot, DB is authoritative. Environment variables are only
    used as seeds for the first-time setup.
    """
    entries = await store.list_worker_urls()
    if entries:
        return [str(e["url"]) for e in entries]
    env_urls = read_env_worker_urls()
    seed = env_urls or [DEFAULT_COMFYUI_URL]
    for url in seed:
        await store.add_worker_url(url)
    return seed


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI 앱 수명주기 관리.
    서버 시작 시 JobStore/WorkerPool/JobManager/WebhookService를 초기화하고,
    이벤트 구독 및 디스패처를 시작한다. 종료 시 정리 작업을 수행한다.

    FastAPI application lifespan manager.
    Initializes JobStore, WorkerPool, JobManager, and WebhookService on startup.
    Sets up event subscriptions and starts the job dispatcher.
    Performs cleanup on shutdown.
    """
    global worker_pool, job_manager, webhook_service
    store = JobStore()
    await store.open()
    initial_urls = await _resolve_initial_worker_urls(store)
    worker_pool = WorkerPool(urls=initial_urls)
    job_manager = JobManager(worker_pool, store=store)
    public_url = os.environ.get("CEG_PUBLIC_URL", "")
    webhook_service = WebhookService(
        store, base_url=public_url, images_dir=DEFAULT_IMAGES_DIR
    )
    await webhook_service.load()

    async def broadcast_with_webhook(event: NormalizedEvent) -> None:
        """이벤트를 WebSocket으로 브로드캐스트하고, 잡 완료/에러 시 웹훅 알림도 발송한다.

        Broadcasts event via WebSocket and fires webhook notifications
        on job completion or error (fire-and-forget).
        """
        await broadcast(event)
        # Webhook notification (fire-and-forget)
        # 웹훅 알림 (비동기 발사 후 잊기)
        if isinstance(event, JobUpdatedEvent):
            job = event.job
            status = job.status
            if status == JobStatus.DONE:
                asyncio.create_task(
                    webhook_service.notify("job_done", job=job.model_dump())
                )
            elif status in (JobStatus.ERROR, JobStatus.CANCELLED):
                asyncio.create_task(
                    webhook_service.notify("job_error", job=job.model_dump())
                )

    job_manager.subscribe(broadcast_with_webhook)
    await job_manager.start()
    logger.info(
        "worker pool started: %s",
        ", ".join(f"{w.id}={w.base_url}" for w in worker_pool.all()),
    )
    try:
        yield
    finally:
        await job_manager.stop()


app = FastAPI(
    title="ComfyEmotionGen Backend",
    version=BACKEND_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploaded_images", StaticFiles(directory=str(UPLOAD_IMAGES_DIR)), name="uploaded_images")


# ====== 에러 핸들러 ======


@app.exception_handler(DSLSyntaxError)
async def _dsl_error_handler(_request: Request, exc: DSLSyntaxError) -> JSONResponse:
    """DSL 구문 오류 핸들러. DSLSyntaxError 발생 시 400 응답으로 변환한다.

    Global error handler for DSL syntax errors.
    Converts DSLSyntaxError exceptions into HTTP 400 JSON responses.
    """
    return JSONResponse(
        status_code=400,
        content={"error": "DSLSyntaxError", "message": str(exc)},
    )


# ====== 헬스/파서 ======

_TEMPLATES_DIR = Path(__file__).parent / "templates"


@app.get("/templates")
def list_system_templates() -> list[dict[str, str]]:
    """시스템 내장 DSL 템플릿 목록을 반환한다.
    templates/ 디렉토리에서 .template 파일을 읽어 리스트로 제공.
    인코딩은 UTF-8 우선, 실패 시 CP949 폴백.

    List built-in system DSL templates.
    Reads .template files from the templates/ directory.
    Tries UTF-8 encoding first, falls back to CP949.
    """
    _TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    templates = []
    for path in sorted(_TEMPLATES_DIR.glob("*.template")):
        name = path.stem
        safe_id = "".join([c if c.isalnum() else "_" for c in name]).strip("_")
        try:
            code = path.read_text(encoding="utf-8")
        except Exception:
            try:
                code = path.read_text(encoding="cp949")
            except Exception:
                continue
        templates.append({
            "id": f"system-{safe_id}",
            "name": name,
            "category": "system",
            "code": code
        })
    return templates


@app.get("/object_info")
async def get_object_info() -> dict[str, JSONValue]:
    """ComfyUI 노드 정의(object_info.json)를 반환한다.
    가용 워커를 찾아 프록시하며, 워커가 없으면 503 에러.

    Returns ComfyUI node definitions (object_info).
    Proxies through an available worker. Returns 503 if no worker is reachable.
    """
    # 1. 워커 프록시 우선 (라이브 데이터 / Proxy live data from worker first)
    worker = worker_pool.find_idle()
    if worker is None:
        for w in worker_pool.all():
            if w.alive:
                worker = w
                break
    if worker is not None:
        try:
            return await worker.get_object_info()
        except Exception as exc:
            logger.warning("worker object_info failed: %s", exc)

    # 2. 가용한 워커가 없으면 503 에러 발생 (ComfyUI가 꺼져 있음을 명시)
    # No available worker → 503 (ComfyUI is offline)
    raise HTTPException(
        status_code=503,
        detail="no available worker and ComfyUI is offline"
    )


@app.get("/version")
def version() -> dict[str, str | None]:
    """백엔드/번들 버전 및 커밋 해시를 반환한다.

    Returns backend version, bundle version, and commit hash.
    """
    return {
        "backend": BACKEND_VERSION,
        "bundle": BUNDLE_VERSION,
        "commit": COMMIT,
    }


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """백엔드 상태 및 전체 워커 풀의 건강 상태를 반환한다.

    Returns backend health status and the health info of all workers.
    """
    workers = [
        WorkerHealthInfo(
            id=info.id,
            url=info.url,
            alive=info.alive,
            busy=info.busy,
            currentJobId=info.current_job_id,
            workerType=getattr(info, "worker_type", "comfyui"),
        )
        for info in worker_pool.info()
    ]
    return HealthResponse(backend="ok", workers=workers)


@app.get("/debug/memory")
async def debug_memory() -> dict[str, JSONValue]:
    """메모리 디버깅용 런타임 카운터를 반환한다.
    CEG_MEMORY_DEBUG=1 환경변수로 tracemalloc을 활성화해야 상세 할당 정보를 볼 수 있다.
    GC 카운트, RSS, asyncio 태스크 수, 잡 상태 등을 포함.

    Runtime memory counters for leak triage.
    Enable tracemalloc with CEG_MEMORY_DEBUG=1 for detailed allocation tracking.
    Includes GC counts, RSS, asyncio task count, and job state diagnostics.
    """
    gc_counts = gc.get_count()
    tasks = asyncio.all_tasks()
    current = peak = None
    top_allocations: list[JSONValue] = []
    if tracemalloc.is_tracing():
        current, peak = tracemalloc.get_traced_memory()
        snapshot = tracemalloc.take_snapshot()
        top_allocations = [
            {
                "file": stat.traceback[0].filename,
                "line": stat.traceback[0].lineno,
                "sizeBytes": stat.size,
                "count": stat.count,
            }
            for stat in snapshot.statistics("lineno")[:10]
        ]
    max_rss_kb = (
        resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if resource is not None
        else None
    )

    snap = await job_manager.diagnostics_snapshot()
    jobs_dict: dict[str, JSONValue] = {
        "jobsTotal": snap.jobsTotal,
        "jobsByStatus": {k: v for k, v in snap.jobsByStatus.items()},
        "listeners": snap.listeners,
        "persistTasks": snap.persistTasks,
        "dispatcherTaskDone": snap.dispatcherTaskDone,
        "stopping": snap.stopping,
        "paused": snap.paused,
    }

    return {
        "process": {
            "maxRssKb": max_rss_kb,
            "gcCounts": {
                "gen0": gc_counts[0],
                "gen1": gc_counts[1],
                "gen2": gc_counts[2],
            },
            "tracemalloc": {
                "enabled": tracemalloc.is_tracing(),
                "currentBytes": current,
                "peakBytes": peak,
                "topAllocations": top_allocations,
            },
        },
        "runtime": {
            "asyncioTasks": len(tasks),
            "webSocketClients": len(ws_clients),
            "workers": len(worker_pool.all()),
        },
        "jobs": jobs_dict,
    }


@app.get("/workers", response_model=WorkersListResponse)
def workers_list() -> WorkersListResponse:
    """현재 등록된 ComfyUI 워커들의 상태 스냅샷을 반환한다.

    Returns a snapshot of all currently registered ComfyUI workers.
    """
    workers = [
        WorkerHealthInfo(
            id=info.id,
            url=info.url,
            alive=info.alive,
            busy=info.busy,
            currentJobId=info.current_job_id,
            workerType=getattr(info, "worker_type", "comfyui"),
        )
        for info in worker_pool.info()
    ]
    return WorkersListResponse(workers=workers)


@app.post("/workers", response_model=WorkerCreateResponse)
async def workers_create(req: WorkerCreateRequest) -> WorkerCreateResponse:
    """새 워커 URL을 등록한다. DB에 영속화하고 워커 풀에 추가한다.

    Register a new worker URL. Persists to DB and adds to the worker pool.
    Returns 400 if the URL is invalid or already registered.
    """
    try:
        view = await job_manager.add_worker(req.url, worker_type=req.worker_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return WorkerCreateResponse(worker=view)


@app.delete("/workers/{worker_id}")
async def workers_delete(worker_id: str, force: bool = False) -> dict[str, bool]:
    """워커를 제거한다. force=False일 때 진행 중인 잡이 있으면 409로 차단.
    force=True면 활성 잡을 취소하고 워커를 제거한다.

    Remove a worker from the pool. If force=False and the worker has an active job,
    returns 409 Conflict. If force=True, cancels the active job and removes the worker.
    """
    try:
        removed = await job_manager.remove_worker(worker_id, force=force)
    except ActiveJobError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "ActiveJob",
                "workerId": exc.worker_id,
                "jobId": exc.job_id,
                "message": "진행 중인 잡이 있습니다. force=true로 다시 호출하면 잡을 취소하고 삭제합니다.",
            },
        )
    if not removed:
        raise HTTPException(status_code=404, detail="worker not found")
    return {"ok": True}


@app.get("/workers/{worker_id}/preview")
async def worker_preview(worker_id: str) -> Response:
    """워커의 최신 미리보기 이미지를 반환한다 (ComfyUI 실시간 preview).
    캐싱된 프리뷰 바이트가 없으면 404.

    Returns the latest preview image from a worker (ComfyUI real-time preview).
    Returns 404 if no preview is available.
    """
    preview_bytes = job_manager.get_worker_preview(worker_id)
    if preview_bytes is None:
        raise HTTPException(status_code=404, detail="no preview available")
    return Response(content=preview_bytes, media_type="image/png")


@app.post("/render", response_model=RenderResponse)
def render_endpoint(req: RenderRequest) -> dict[str, JSONValue]:
    """CEG DSL 템플릿을 파싱하고 렌더링하여 프롬프트 목록을 반환한다.
    축 조합, 필터링, 페이지네이션 등을 적용.

    Parse and render a CEG DSL template into a list of prompts.
    Applies axis combinations, filtering (only/fix/excludes), and pagination.
    """
    prog = parse(req.template)
    rendered = render(
        prog,
        only=req.only,
        fix=req.fix,
        skip_excludes=req.skip_excludes,
        extra_excludes=req.extra_excludes,
        limit=req.limit,
        offset=req.offset,
    )
    return {
        "count": rendered["total"],
        "items": rendered["items"],
        "axes": rendered["axes"],
        "sets": rendered["sets"],
        "excludes": rendered["excludes"],
        "template_structure": rendered.get("template_structure", []),
    }


@app.post("/workflow/inject", response_model=InjectResponse)
def inject_endpoint(req: InjectRequest) -> InjectResponse:
    """ComfyUI 워크플로우 JSON에 프롬프트를 주입한다.
    지정된 플레이스홀더 위치에 프롬프트 텍스트를 삽입.

    Inject prompts into a ComfyUI workflow JSON.
    Replaces the specified placeholder with the prompt text.
    """
    injected = inject_into_workflow(req.workflow, req.prompt, req.placeholder)
    injected_dict = injected if isinstance(injected, dict) else {}
    return InjectResponse(workflow=injected_dict)


# ====== 잡 ======


@app.post("/jobs")
async def jobs_create(req: JobsCreateRequest) -> dict[str, list[str]]:
    """잡 N개를 등록한다. 프론트엔드가 시드/프롬프트가 주입된 워크플로우를 제출.
    등록된 잡 ID 목록을 반환한다.

    Submit N jobs for processing. The frontend sends workflows with seeds/prompts
    already injected. Returns the list of created job IDs.
    """
    # items = [item.model_dump() for item in req.items]
    jobs = await job_manager.submit(req.items)
    return {"jobIds": [j.id for j in jobs]}


@app.get("/jobs")
async def jobs_list(
    limit: int = 100,
    offset: int = 0,
    status: List[str] = Query(None),
    search: List[str] = Query(None),
    created_at_from: Optional[float] = None,
    created_at_to: Optional[float] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> JobQueryResponse:
    """잡 목록을 조회한다. 상태, 검색 태그, 생성일 범위, 정렬 등으로 필터링 가능.

    Query job list with optional filters: status, search tags,
    creation date range, sort order, and pagination.
    """
    return await job_manager.query_jobs(
        limit=limit,
        offset=offset,
        statuses=status,
        search_tags=search,
        created_at_from=created_at_from,
        created_at_to=created_at_to,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@app.post("/jobs/session-stats", response_model=SessionStatsResponse)
async def jobs_session_stats(req: SessionStatsRequest) -> SessionStatsResponse:
    """세션별 잡 통계를 계산한다.
    세션 마커를 기반으로 각 잡을 세션에 매칭하고, 세션별 잡 수 및 선택된 세션의 상태별 카운트를 반환.

    Calculate per-session job statistics.
    Matches each job to a session using session markers, and returns
    job counts per session and status breakdown for the selected session.
    """
    # 1. DB에서 minimal job list 로드
    jobs_minimal = await job_manager._store.get_all_jobs_minimal()

    # 2. 인메모리(활성 잡) 상태 병합
    async with job_manager._lock:
        for job_dict in jobs_minimal:
            jid = job_dict["id"]
            if isinstance(jid, str) and jid in job_manager._jobs:
                job_dict["status"] = job_manager._jobs[jid].status

    # 3. 세션 매칭 및 카운팅
    sorted_markers = sorted(req.markers, key=lambda x: x.startAt, reverse=True)

    session_job_counts: dict[str, int] = {}
    selected_session_counts: dict[str, int] = {
        "pending": 0,
        "queued": 0,
        "running": 0,
        "done": 0,
        "error": 0,
        "cancelled": 0,
        "active": 0,
    }

    for job in jobs_minimal:
        created_at_val = job["createdAt"]
        created_at = float(created_at_val) if isinstance(created_at_val, (int, float)) else 0.0
        t = created_at * 1000  # seconds to ms

        sid = ""
        if req.activeState and t >= req.activeState.activatedAt:
            sid = req.activeState.activeSessionId
        else:
            for m in sorted_markers:
                if t >= m.startAt:
                    sid = m.id
                    break
            if not sid and sorted_markers:
                sid = sorted_markers[-1].id

        if sid:
            session_job_counts[sid] = session_job_counts.get(sid, 0) + 1
            if sid == req.selectedSessionId:
                status_val = job.get("status")
                status = str(status_val) if status_val is not None else ""
                if status in selected_session_counts:
                    selected_session_counts[status] += 1
                if status in ("pending", "queued", "running"):
                    selected_session_counts["active"] += 1

    return SessionStatsResponse(
        sessionJobCounts=session_job_counts,
        selectedSessionCounts=selected_session_counts,
    )


@app.delete("/jobs/{job_id}")
async def jobs_cancel(job_id: str) -> dict[str, bool]:
    """잡을 취소한다. 이미 완료된 잡이거나 존재하지 않으면 404.

    Cancel a job. Returns 404 if the job is not found or already finished.
    """
    ok = await job_manager.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found or already finished")
    return {"ok": True}


@app.post("/jobs/cancel-all")
async def jobs_cancel_all() -> dict[str, int]:
    """모든 대기/실행 중인 잡을 일괄 취소한다. 취소된 잡 수를 반환.

    Cancel all pending/running jobs. Returns the count of cancelled jobs.
    """
    count = await job_manager.cancel_all()
    return {"cancelled": count}


@app.post("/jobs/delete")
async def jobs_delete(req: JobsDeleteRequest) -> dict[str, int]:
    """잡을 영구 삭제한다 (DB + 메모리에서 제거). 삭제된 잡 수를 반환.

    Permanently delete jobs from both DB and memory. Returns deleted count.
    """
    count = await job_manager.remove_batch(req.job_ids)
    return {"deleted": count}


@app.delete("/jobs/{job_id}/remove")
async def jobs_remove(job_id: str) -> dict[str, bool]:
    """단일 잡을 영구 삭제한다. 존재하지 않으면 404.

    Permanently remove a single job. Returns 404 if not found.
    """
    ok = await job_manager.remove(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found")
    return {"ok": True}

@app.post("/jobs/{job_id}/retry")
async def jobs_retry(job_id: str) -> dict[str, str]:
    """실패한 잡을 재시도한다. 동일한 워크플로우로 새 잡을 생성.
    원본 잡이 없으면 404, 재시도 실패 시 500.

    Retry a failed job by creating a new job with the same workflow.
    Returns 404 if original job not found, 500 if retry fails.
    """
    job = await job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    new_jobs = await job_manager.retry([job])
    if not new_jobs:
        raise HTTPException(status_code=500, detail="retry failed: no new job created")
    return {"jobId": new_jobs[0].id}
@app.post("/jobs/{job_id}/move", response_model=JobMoveResponse)
async def jobs_move(job_id: str, req: JobMoveRequest) -> JobMoveResponse:
    """대기 중인 잡을 다른 워커로 이동한다 (동일 worker_type만 가능).
    이동 불가 시 400 에러.

    Move a queued job to a different worker (same worker_type only).
    Returns 400 if the move is not allowed.
    """
    try:
        payload = await job_manager.move_job(job_id, req.targetWorkerId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return JobMoveResponse(ok=True, job=payload)
@app.post("/jobs/pause")
async def jobs_pause() -> dict[str, bool]:
    """잡 디스패처를 일시정지한다. 새 잡이 워커에 배정되지 않음.

    Pause the job dispatcher. No new jobs will be dispatched to workers.
    """
    await job_manager.set_paused(True)
    return {"paused": True}


@app.post("/jobs/resume")
async def jobs_resume() -> dict[str, bool]:
    """잡 디스패처를 재개한다. 일시정지된 큐의 잡들이 다시 배정됨.

    Resume the job dispatcher. Paused queued jobs will be dispatched again.
    """
    await job_manager.set_paused(False)
    return {"paused": False}


# ====== 잡 로그 ======


@app.get("/jobs/{job_id}/events", response_model=JobEventsResponse)
async def job_events(job_id: str) -> JobEventsResponse:
    """특정 잡의 상태 전환 이력 (audit log)을 반환한다.

    Returns the state transition history (audit log) for a specific job.
    """
    events = await job_manager._store.get_job_events(job_id)
    return JobEventsResponse(jobId=job_id, events=events)


@app.get("/jobs/{job_id}/execution-events", response_model=JobExecutionEventsResponse)
async def job_execution_events(job_id: str) -> JobExecutionEventsResponse:
    """특정 잡의 ComfyUI 실행 이벤트(진행률, 노드 출력 등)를 반환한다.

    Returns ComfyUI execution events (progress, node outputs, etc.)
    for a specific job.
    """
    events = await job_manager._store.get_execution_events(job_id)
    return JobExecutionEventsResponse(jobId=job_id, events=events)


@app.get("/logs", response_model=LogsResponse)
async def logs_all(
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    worker_id: str | None = None,
) -> LogsResponse:
    """필터링된 전체 잡 이벤트 로그를 페이지네이션과 함께 반환한다.
    상태, 워커 ID로 필터링 가능.

    Returns filtered job event logs with pagination.
    Can filter by status and worker ID.
    """
    events = await job_manager._store.get_all_events(
        limit=limit,
        offset=offset,
        status=status,
        worker_id=worker_id,
    )
    return LogsResponse(events=events, limit=limit, offset=offset)


# ====== 이미지 프록시 ======


@app.get("/images/{worker_id}/view")
async def images_view(
    worker_id: str,
    filename: str,
    subfolder: str = "",
    type: str = "output",
) -> StreamingResponse:
    """ComfyUI 워커의 출력 이미지를 스트리밍 프록시로 제공한다.
    프론트엔드가 워커에 직접 접근하지 않고 백엔드를 통해 이미지를 받을 수 있게 함.

    Stream an output image from a ComfyUI worker as a proxy.
    Allows the frontend to fetch worker images through the backend
    without direct access to worker URLs.
    """
    worker = worker_pool.get(worker_id)
    if worker is None:
        raise HTTPException(status_code=404, detail="unknown worker")

    async def stream() -> AsyncGenerator[bytes, None]:
        try:
            async for chunk in worker.stream_output(
                {"filename": filename, "subfolder": subfolder, "type": type}
            ):
                yield chunk
        except Exception:
            logger.exception("stream error for worker %s", worker_id)

    media_type = "image/png" if filename.lower().endswith(".png") else "application/octet-stream"
    return StreamingResponse(stream(), media_type=media_type)


# ====== 이미지 업로드 (프론트에서 미리 업로드, 디스패치 시 워커로 전달) ======


@app.post("/images/upload")
async def images_upload(file: UploadFile) -> dict[str, str]:
    """클라이언트에서 이미지를 업로드한다. SHA-256 해시로 저장 후 해시를 반환.
    디스패치 시 이 이미지를 워커의 /upload/image로 전달하고
    워크플로우의 __upload__{hash}.png 마커를 실제 파일명으로 치환한다.

    Upload an image from the client. Saved using SHA-256 hash as filename.
    During job dispatch, this image is forwarded to the worker's /upload/image
    endpoint, and __upload__{hash}.png markers in the workflow are replaced
    with the actual filename.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="empty filename")
    ext = Path(file.filename).suffix.lower() or ".png"
    try:
        data = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="failed to read uploaded file")
    sha = hashlib.sha256(data).hexdigest()
    UPLOAD_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_IMAGES_DIR / f"{sha}{ext}"
    if not target.exists():
        try:
            target.write_bytes(data)
        except OSError:
            raise HTTPException(status_code=500, detail="failed to save uploaded file to disk")
    return {"hash": sha, "filename": file.filename, "name": f"{sha}{ext}"}



# ====== 영속 이미지 ======


@app.get("/saved-images", response_model=SavedImagesListResponse)
async def saved_images_list(
    limit: int = 100,
    offset: int = 0,
    job_id: str | None = None,
    status: str | None = None,
    filename: str | None = None,
    tag: str | None = None,
) -> SavedImagesListResponse:
    """디스크에 영속화된 이미지 목록을 반환한다.
    job_id, status, filename, tag로 필터링 가능. 페이지네이션 지원.

    List persisted (saved) images on disk.
    Supports filtering by job_id, status, filename, and tag with pagination.
    """
    items_raw = await job_manager._store.list_saved_images(
        limit=limit,
        offset=offset,
        job_id=job_id,
        status=status,
        filename=filename,
        tag=tag,
    )
    total = await job_manager._store.count_saved_images(
        job_id=job_id, status=status, filename=filename, tag=tag
    )
    items = [SavedImageResponse.model_validate(it) for it in items_raw]
    return SavedImagesListResponse(items=items, limit=limit, offset=offset, total=total)


@app.get("/jobs/{job_id}/saved-images", response_model=JobSavedImagesResponse)
async def saved_images_for_job(job_id: str) -> JobSavedImagesResponse:
    """특정 잡이 생성한 영속 이미지 목록을 반환한다.

    Returns all persisted images created by a specific job.
    """
    items_raw = await job_manager._store.list_saved_images(
        limit=10_000, offset=0, job_id=job_id
    )
    items = [SavedImageResponse.model_validate(it) for it in items_raw]
    return JobSavedImagesResponse(jobId=job_id, items=items)


@app.get("/saved-images/{hash}")
async def saved_image_serve(hash: str) -> FileResponse:
    """해시로 영속 이미지 파일 바이트를 서빙한다. 없으면 404.

    Serve a persisted image file by its hash. Returns 404 if not found.
    """
    record = await job_manager._store.get_saved_image(hash)
    if record is None:
        raise HTTPException(status_code=404, detail="image not found")
    ext = record.get("extension") or ".png"
    path = DEFAULT_IMAGES_DIR / f"{hash}{ext}"
    if not path.exists():
        raise HTTPException(status_code=404, detail="image file missing on disk")
    media_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(str(path), media_type=media_type)


@app.get("/saved-images/{hash}/meta", response_model=SavedImageResponse)
async def saved_image_meta(hash: str) -> SavedImageResponse:
    """영속 이미지의 메타데이터만 반환한다 (이미지 바이트 제외).

    Returns only the metadata of a persisted image (without image bytes).
    """
    record = await job_manager._store.get_saved_image(hash)
    if record is None:
        raise HTTPException(status_code=404, detail="image not found")
    return SavedImageResponse.model_validate(record)


@app.patch("/saved-images/{hash}")
async def saved_image_patch(hash: str, body: CurationPatch) -> SavedImageResponse:
    """영속 이미지의 큐레이션 상태(승인/거절/휴지통)나 메모를 업데이트한다.

    Update curation status (approved/rejected/trashed) or note of a persisted image.
    """
    updated = await job_manager.update_curation(
        hash, status=body.status, note=body.note
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="image not found")
    return updated


@app.post("/saved-images/{hash}/tags")
async def saved_image_add_tags(hash: str, body: TagsAddRequest) -> dict[str, str | list[str]]:
    """영속 이미지에 태그를 추가한다. 업데이트된 태그 목록을 반환.

    Add tags to a persisted image. Returns the updated tag list.
    """
    tags = await job_manager.add_image_tags(hash, body.tags)
    if tags is None:
        raise HTTPException(status_code=404, detail="image not found")
    return {"hash": hash, "tags": tags}


@app.post("/saved-images/{hash}/auto-tags")
async def saved_image_auto_tags(hash: str) -> dict[str, str | list[str]]:
    """영속 이미지에 자동 태그를 생성한다. 메타데이터 기반 자동 추출.

    Auto-generate tags for a persisted image based on its metadata.
    """
    tags = await job_manager.auto_generate_image_tags(hash)
    if tags is None:
        raise HTTPException(status_code=404, detail="image not found")
    return {"hash": hash, "tags": tags}


@app.post("/saved-images/auto-tags/bulk")
async def saved_images_bulk_auto_tags(body: BulkAutoTagsRequest) -> dict[str, dict[str, list[str]]]:
    """여러 이미지에 대해 자동 태그를 일괄 생성한다.

    Bulk auto-generate tags for multiple images by their hashes.
    """
    result = await job_manager.bulk_auto_generate_image_tags(body.hashes)
    return {"results": result}


@app.post("/saved-images/auto-tags/empty")
async def saved_images_auto_tags_empty() -> dict[str, dict[str, list[str]]]:
    """태그가 비어 있는 모든 이미지에 자동 태그를 생성한다.

    Auto-generate tags for all images that currently have no tags.
    """
    result = await job_manager.auto_generate_all_empty_image_tags()
    return {"results": result}


@app.delete("/saved-images/{hash}/tags/{tag}")
async def saved_image_remove_tag(hash: str, tag: str) -> dict[str, str | list[str]]:
    """영속 이미지에서 특정 태그를 제거한다. 업데이트된 태그 목록을 반환.

    Remove a specific tag from a persisted image. Returns the updated tag list.
    """
    tags = await job_manager.remove_image_tag(hash, tag)
    if tags is None:
        raise HTTPException(status_code=404, detail="image not found")
    return {"hash": hash, "tags": tags}


@app.post("/saved-images/{hash}/restore")
async def saved_image_restore(hash: str) -> SavedImageResponse:
    """휴지통에 있는 이미지를 pending 상태로 복원한다.

    Restore a trashed image back to 'pending' status.
    """
    updated = await job_manager.update_curation(hash, status="pending")
    if updated is None:
        raise HTTPException(status_code=404, detail="image not found")
    return updated


@app.get("/tags")
async def tags_list() -> dict[str, list[dict[str, JSONValue]]]:
    """태그별 사용 카운트 목록을 반환한다.

    Returns a list of tags with their usage counts.
    """
    return {"tags": await job_manager._store.list_tag_counts()}


# ====== 휴지통 ======


@app.get("/trash", response_model=TrashListResponse)
async def trash_list(limit: int = 200, offset: int = 0) -> TrashListResponse:
    """휴지통(trashed 상태) 이미지 목록을 페이지네이션과 함께 반환한다.

    List trashed images with pagination.
    """
    items = await job_manager._store.list_saved_images(
        limit=limit, offset=offset, status="trashed"
    )
    return TrashListResponse(items=items, limit=limit, offset=offset)


@app.post("/trash/empty")
async def trash_empty() -> dict[str, int]:
    """휴지통을 비운다. 디스크와 DB에서 영구 삭제. 삭제된 이미지 수를 반환.

    Empty the trash. Permanently deletes trashed images from disk and DB.
    Returns the number of deleted images.
    """
    deleted = await job_manager.empty_trash()
    return {"deleted": deleted}


# ====== filename 그룹 ======


@app.get("/asset-groups", response_model=AssetGroupsListResponse)
async def asset_groups_list(
    limit: int = 100,
    offset: int = 0,
    sort: str = "latest",
) -> AssetGroupsListResponse:
    """파일명(filename)별로 이미지를 그룹화한 후보군 목록을 반환한다.
    정렬 기준: latest(최신순) 등. 페이지네이션 지원.

    List images grouped by filename (asset groups).
    Supports sort order (e.g., 'latest') and pagination.
    """
    groups = await job_manager._store.list_asset_groups(
        limit=limit, offset=offset, sort=sort
    )
    return AssetGroupsListResponse(groups=groups, limit=limit, offset=offset, sort=sort)


@app.get("/asset-groups/{filename}", response_model=AssetGroupDetailResponse)
async def asset_group_detail(filename: str, status: str | None = None) -> AssetGroupDetailResponse:
    """특정 파일명 그룹에 속한 모든 이미지를 반환한다. 상태로 필터링 가능.

    Returns all images belonging to a specific filename group.
    Optional status filter.
    """
    items = await job_manager._store.list_saved_images(
        limit=10_000, offset=0, filename=filename, status=status
    )
    return AssetGroupDetailResponse(filename=filename, items=items)


# ====== 데이터셋 익스포트 ======


@app.post("/export")
async def export_dataset(body: ExportRequest) -> StreamingResponse:
    """큐레이션된 이미지를 ZIP 아카이브로 내보낸다.
    상태/파일명/태그로 필터링 가능. manifest.txt와 metadata.json을 포함.
    중복 파일명은 hash/number 전략으로 처리.

    Export curated images as a ZIP archive.
    Supports filtering by status, filenames, and tags.
    Includes manifest.txt and metadata.json. Handles duplicate filenames
    via 'hash' or 'number' strategy.
    """
    items_all: list[dict[str, JSONValue]] = []
    if body.filenames:
        for fn in body.filenames:
            items_all.extend(
                await job_manager._store.list_saved_images(
                    limit=10_000, offset=0, filename=fn, status=body.status
                )
            )
    else:
        items_all = await job_manager._store.list_saved_images(
            limit=100_000, offset=0, status=body.status
        )

    if body.tags:
        required = set(body.tags)
        filtered_items: list[dict[str, JSONValue]] = []
        for it in items_all:
            tags_val = it.get("tags")
            tags_list = tags_val if isinstance(tags_val, list) else []
            tags_set = {str(t) for t in tags_list}
            if required.issubset(tags_set):
                filtered_items.append(it)
        items_all = filtered_items

    buf = io.BytesIO()
    try:
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            manifest_lines: list[str] = []
            metadata: list[dict[str, JSONValue]] = []
            used_names: set[str] = set()
            dup_counters: dict[str, int] = {}
            for item in items_all:
                h_val = item.get("hash")
                h = str(h_val) if h_val is not None else ""
                if not h:
                    continue
                ext_val = item.get("extension")
                ext = str(ext_val) if ext_val is not None else ".png"
                disk_path = DEFAULT_IMAGES_DIR / f"{h}{ext}"
                if not disk_path.exists():
                    continue
                orig_val = item.get("originalFilename")
                orig = str(orig_val) if orig_val is not None else h
                name = f"{orig}{ext}"
                if name in used_names:
                    if body.duplicateStrategy == "number":
                        dup_counters[orig] = dup_counters.get(orig, 0) + 1
                        name = f"{orig}_{dup_counters[orig]}{ext}"
                    else:
                        name = f"{orig}_{h[:8]}{ext}"
                used_names.add(name)
                zf.write(disk_path, arcname=f"images/{name}")
                manifest_lines.append(f"{name}\t{orig}")
                metadata.append(
                    {
                        "hash": h,
                        "filename": orig,
                        "prompt": item.get("prompt", ""),
                        "status": item.get("status", ""),
                        "tags": item.get("tags", []),
                        "note": item.get("note", ""),
                        "workerId": item.get("workerId"),
                        "createdAt": item.get("createdAt"),
                        "sizeBytes": item.get("sizeBytes", 0),
                        "extension": ext,
                    }
                )
            zf.writestr(
                "metadata.json",
                json.dumps(metadata, ensure_ascii=False, indent=2),
            )
            zf.writestr("manifest.txt", "\n".join(manifest_lines))
    except Exception:
        logger.exception("export dataset failed")
        raise HTTPException(status_code=500, detail="failed to create export zip")

    buf.seek(0)
    headers = {
        "Content-Disposition": 'attachment; filename="dataset.zip"',
    }
    return StreamingResponse(
        buf, media_type="application/zip", headers=headers
    )


# ====== WebSocket ======


# ====== 웹훅 ======


class WebhookCreateRequest(BaseModel):
    """웹훅 생성 요청 모델. 새 웹훅 채널(Discord/Telegram/generic)을 등록한다.

    Webhook creation request. Registers a new webhook channel
    (Discord, Telegram, or generic). Used by POST /webhooks.
    """
    name: str
    channel_type: Literal["discord", "telegram", "generic"]
    url: str
    events: list[str] = WEBHOOK_EVENTS
    enabled: bool = True
    include_image: bool = False


class WebhookUpdateRequest(BaseModel):
    """웹훅 수정 요청 모델. 기존 웹훅 설정을 부분적으로 업데이트한다.

    Webhook update request. Partially updates an existing webhook configuration.
    Used by PUT /webhooks/{config_id}.
    """
    name: Optional[str] = None
    channel_type: Optional[Literal["discord", "telegram", "generic"]] = None
    url: Optional[str] = None
    events: Optional[list[str]] = None
    enabled: Optional[bool] = None
    include_image: Optional[bool] = None


class BatchCompleteRequest(BaseModel):
    """배치 완료 알림 요청 모델. 배치 작업의 완료/에러/전체 카운트를 담아 웹훅으로 전송.

    Batch complete notification request. Contains done/error/total counts
    for sending batch completion webhooks.
    Used by POST /webhooks/batch-complete.
    """
    done: int = 0
    error: int = 0
    total: int = 0


class SettingValueRequest(BaseModel):
    """설정 값 요청 모델. 단일 앱 설정의 값을 담는다.

    Setting value request. Contains a single app setting value.
    Used by PUT /app-settings/{key}.
    """
    value: str


class ClientLogRequest(BaseModel):
    """클라이언트 로그 요청 모델. 프론트엔드에서 발생한 에러/경고/정보를 서버 로그에 기록.

    Client log request. Records frontend errors/warnings/info
    to the server-side logger. Used by POST /logs/client.
    """
    level: str = "error"
    message: str
    stack: Optional[str] = None
    url: Optional[str] = None
    userAgent: Optional[str] = None


@app.post("/logs/client")
async def client_log_endpoint(req: ClientLogRequest, request: Request) -> dict[str, bool]:
    """프론트엔드 클라이언트의 로그를 서버 로거에 기록한다.
    클라이언트 IP, URL, User-Agent, 스택 트레이스 등을 포함.

    Record frontend client logs to the server logger.
    Includes client IP, URL, user agent, and stack trace information.
    """
    client_ip = request.client.host if request.client else "unknown"
    log_msg = f"[Client {client_ip}] {req.message}"
    if req.url:
        log_msg += f" (URL: {req.url})"
    if req.userAgent:
        log_msg += f" (UA: {req.userAgent})"
    if req.stack:
        log_msg += f"\nStack Trace:\n{req.stack}"

    if req.level == "info":
        logger.info(log_msg)
    elif req.level == "warning":
        logger.warning(log_msg)
    else:
        logger.error(log_msg)
    return {"ok": True}


# ====== 데이터베이스 관리 ======

@app.get("/db/export")
async def db_export() -> FileResponse:
    """SQLite jobs.db 데이터베이스 파일을 직접 내보낸다 (백업용).

    Export the SQLite jobs.db database file directly (for backup).
    """
    db_path = job_manager._store._db_path
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Database file not found")
    
    headers = {
        "Content-Disposition": 'attachment; filename="jobs.db"',
    }
    return FileResponse(
        str(db_path),
        media_type="application/x-sqlite3",
        headers=headers,
    )


@app.post("/db/import")
async def db_import(file: UploadFile) -> dict[str, bool]:
    """SQLite jobs.db 데이터베이스 파일을 업로드받아 덮어쓰고 복원한다.
    기존 DB 연결을 닫고, 파일을 덮어쓰고, 재오픈 후 메모리 상태를 동기화.
    모든 WebSocket 클라이언트에 스냅샷을 브로드캐스트하여 UI를 새로고침.

    Upload and restore a SQLite database file.
    Closes existing DB connection, overwrites the file, reopens,
    reloads in-memory state, and broadcasts a snapshot to all clients.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="empty filename")
    
    db_path = job_manager._store._db_path
    
    # 1. 기존 DB 커넥션 종료
    await job_manager._store.close()
    
    try:
        # 2. 파일 덮어쓰기
        content = await file.read()
        db_path.write_bytes(content)
    except Exception as exc:
        # 실패 시 재오픈 시도
        await job_manager._store.open()
        raise HTTPException(status_code=500, detail=f"Failed to write database: {exc}")
    
    # 3. 새로운 DB 커넥션 오픈 및 마이그레이션 실행
    try:
        await job_manager._store.open()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open imported database: {exc}")
    
    # 4. 메모리 로드 동기화
    try:
        await job_manager.reload_jobs()
    except Exception:
        logger.exception("failed to reload jobs after import")
    
    # 5. UI 동기화 이벤트 송출 (모든 클라이언트가 잡 목록을 새로고침할 수 있게 함)
    snapshot = await job_manager.snapshot()
    await broadcast(
        SnapshotEvent(
            type="snapshot",
            jobs=snapshot,
            workers=[
                SnapshotWorker(
                    id=info.id,
                    url=info.url,
                    alive=info.alive,
                    busy=info.busy,
                    currentJobId=info.current_job_id,
                )
                for info in worker_pool.info()
            ],
            paused=job_manager.paused,
        )
    )
    
    return {"ok": True}


# ====== App Settings (client-side localStorage → server storage) ======

@app.get("/app-settings")
async def app_settings_list() -> dict[str, str]:
    """서버에 저장된 모든 클라이언트 앱 설정을 반환한다.

    Returns all client app settings stored on the server.
    """
    return await job_manager._store.list_settings()


@app.get("/app-settings/{key}")
async def app_settings_get(key: str) -> dict[str, str]:
    """단일 앱 설정을 키로 조회한다. 없으면 404.

    Get a single app setting by key. Returns 404 if not found.
    """
    v = await job_manager._store.get_setting(key)
    if v is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    return {"key": key, "value": v}


@app.put("/app-settings/{key}")
async def app_settings_set(
    key: str,
    req: SettingValueRequest,
    request: Request,
) -> dict[str, bool]:
    """앱 설정을 저장하고 모든 WebSocket 클라이언트에 변경 이벤트를 브로드캐스트한다.

    Save an app setting and broadcast the change event to all WebSocket clients.
    """
    client_id = request.headers.get("x-client-id")
    await job_manager._store.save_setting(key, req.value)
    await broadcast(
        SettingsUpdatedEvent(
            type="settings.updated",
            key=key,
            value=req.value,
            sender=client_id or "",
        )
    )
    return {"ok": True}


@app.delete("/app-settings/{key}")
async def app_settings_delete(key: str, request: Request) -> dict[str, bool]:
    """앱 설정을 삭제하고 모든 WebSocket 클라이언트에 변경 이벤트를 브로드캐스트한다.

    Delete an app setting and broadcast the change event to all WebSocket clients.
    """
    client_id = request.headers.get("x-client-id")
    await job_manager._store.delete_setting(key)
    await broadcast(
        SettingsUpdatedEvent(
            type="settings.updated",
            key=key,
            value=None,
            sender=client_id or "",
        )
    )
    return {"ok": True}


@app.get("/webhooks", response_model=WebhooksListResponse)
async def webhooks_list() -> WebhooksListResponse:
    """등록된 모든 웹훅 설정을 반환한다.

    Returns all registered webhook configurations.
    """
    configs = [
        WebhookConfigResponse(
            id=c.id,
            name=c.name,
            channel_type=c.channel_type,
            url=c.url,
            events=c.events,
            enabled=c.enabled,
            include_image=c.include_image,
        )
        for c in webhook_service._configs
    ]
    return WebhooksListResponse(configs=configs)


@app.post("/webhooks", response_model=WebhookDetailResponse)
async def webhooks_create(req: WebhookCreateRequest) -> WebhookDetailResponse:
    """새 웹훅 채널을 등록한다. DB에 영속화.

    Register a new webhook channel. Persists to DB.
    """
    cfg = await webhook_service.add_config(
        name=req.name,
        channel_type=req.channel_type,
        url=req.url,
        events=req.events,
        enabled=req.enabled,
        include_image=req.include_image,
    )
    return WebhookDetailResponse(
        config=WebhookConfigResponse(
            id=cfg.id,
            name=cfg.name,
            channel_type=cfg.channel_type,
            url=cfg.url,
            events=cfg.events,
            enabled=cfg.enabled,
            include_image=cfg.include_image,
        )
    )


@app.put("/webhooks/{config_id}", response_model=WebhookDetailResponse)
async def webhooks_update(
    config_id: str,
    req: WebhookUpdateRequest,
) -> WebhookDetailResponse:
    """기존 웹훅 설정을 업데이트한다. 존재하지 않으면 404.

    Update an existing webhook configuration. Returns 404 if not found.
    """
    cfg = await webhook_service.update_config(
        config_id,
        name=req.name,
        channel_type=req.channel_type,
        url=req.url,
        events=req.events,
        enabled=req.enabled,
        include_image=req.include_image,
    )
    if cfg is None:
        raise HTTPException(status_code=404, detail="webhook not found")
    return WebhookDetailResponse(
        config=WebhookConfigResponse(
            id=cfg.id,
            name=cfg.name,
            channel_type=cfg.channel_type,
            url=cfg.url,
            events=cfg.events,
            enabled=cfg.enabled,
            include_image=cfg.include_image,
        )
    )


@app.delete("/webhooks/{config_id}")
async def webhooks_delete(config_id: str) -> dict[str, bool]:
    """웹훅 설정을 삭제한다. 존재하지 않으면 404.

    Delete a webhook configuration. Returns 404 if not found.
    """
    ok = await webhook_service.delete_config(config_id)
    if not ok:
        raise HTTPException(status_code=404, detail="webhook not found")
    return {"ok": True}


@app.post("/webhooks/{config_id}/test")
async def webhooks_test(config_id: str) -> dict[str, bool]:
    """웹훅 테스트 알림을 전송한다. 더미 job_done 이벤트를 발송.

    Send a test webhook notification. Fires a dummy job_done event.
    """
    found = False
    for cfg in webhook_service._configs:
        if cfg.id == config_id:
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="webhook not found")
    await webhook_service.notify(
        "job_done",
        job={
            "filename": "webhook_test",
            "prompt": "This is a test notification.",
            "executionDurationMs": 0,
            "savedImageHashes": [],
        },
    )
    return {"ok": True}


@app.post("/webhooks/batch-complete")
async def webhooks_batch_complete(req: BatchCompleteRequest) -> dict[str, bool]:
    """배치 작업 완료 알림을 웹훅으로 전송한다.
    done/error/total 카운트를 포함.

    Send a batch completion notification via webhooks.
    Includes done/error/total counts.
    """
    await webhook_service.notify(
        "batch_completed",
        batch_info={
            "done": req.done,
            "error": req.error,
            "total": req.total,
        },
    )
    return {"ok": True}


# ====== WebSocket ======


@app.websocket("/ws/events")
async def ws_events(websocket: WebSocket) -> None:
    """실시간 이벤트 스트리밍 WebSocket 엔드포인트.
    연결 시 현재 잡/워커 스냅샷을 즉시 전송하고,
    이후 모든 이벤트(잡 업데이트, 설정 변경 등)를 실시간으로 브로드캐스트.
    클라이언트의 keepalive 메시지는 현재 무시됨.

    Real-time event streaming WebSocket endpoint.
    Sends the current job/worker snapshot immediately on connection,
    then broadcasts all events (job updates, settings changes, etc.) in real-time.
    Client keepalive messages are currently ignored.
    """
    try:
        await websocket.accept()
    except Exception:
        return
    ws_clients.add(websocket)
    try:
        # 연결 직후 현재 스냅샷 전송
        snapshot = await job_manager.snapshot()
        event = SnapshotEvent(
            type="snapshot",
            jobs=snapshot,
            workers=[
                SnapshotWorker(
                    id=info.id,
                    url=info.url,
                    alive=info.alive,
                    busy=info.busy,
                    currentJobId=info.current_job_id,
                )
                for info in worker_pool.info()
            ],
            paused=job_manager.paused,
        )
        await websocket.send_json(event.model_dump())
        # 클라이언트가 보내는 메시지는 현재는 무시 (keepalive)
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.warning("ws_events error for client", exc_info=True)
    finally:
        ws_clients.discard(websocket)


# ====== 정적 파일 서빙 (번들된 프론트엔드) / Static file serving (bundled frontend) ======

_static_dir = os.environ.get("CEG_STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():

    @app.get("/config.js")
    def _config_js() -> Response:
        """프론트엔드에 백엔드 URL을 주입하는 동적 config.js를 반환한다.
        번들 배포 시 프론트엔드가 같은 origin의 백엔드를 사용하도록 설정.

        Returns a dynamic config.js that injects the backend URL into the frontend.
        Ensures the bundled frontend uses the same origin as its backend.
        """
        return Response(
            "window.COMFY_EMOTION_GEN_BACKEND_URL = window.location.origin;",
            media_type="application/javascript",
        )

    # CEG_STATIC_DIR이 설정되면 빌드된 프론트엔드를 루트에 마운트
    # Mount the built frontend at root when CEG_STATIC_DIR is set
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
