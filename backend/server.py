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
    POST /asset-groups/{filename}/regenerate - 같은 워크플로우 새 시드로 재생성
    POST /export                       - 큐레이션 결과 zip 다운로드
    GET  /jobs/{id}/saved-images       - 특정 잡이 만든 영속 이미지 목록
    GET  /object_info                  - ComfyUI 노드 정의 (object_info.json)
    GET  /workers                      - 워커 스냅샷
    POST /workers                      - 새 ComfyUI 워커 URL 등록
    DELETE /workers/{id}               - 워커 제거 (force=true로 활성 잡 강제 취소)
    WS   /ws/events                    - 정규화 이벤트 스트림
"""

from __future__ import annotations

import io
import json
import logging
import mimetypes
import zipfile
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from prompt_dsl import DSLSyntaxError, parse, render, inject_into_workflow
from worker_pool import DEFAULT_COMFYUI_URL, WorkerPool, read_env_worker_urls
from jobs import ActiveJobError, JobManager, DEFAULT_IMAGES_DIR
from job_store import JobStore
from _version import BACKEND_VERSION, BUNDLE_VERSION, COMMIT

logger = logging.getLogger(__name__)


# ====== 전역 상태 (lifespan에서 초기화) ======

worker_pool: WorkerPool
job_manager: JobManager
ws_clients: set[WebSocket] = set()


# ====== Pydantic 모델 ======


class RenderRequest(BaseModel):
    template: str = Field(..., description="DSL 템플릿 소스")
    only: Optional[Dict[str, List[str]]] = Field(None, description="특정 axis 값만 포함 (예: {\"emotion\": [\"happy\",\"sad\"]})")
    fix: Optional[Dict[str, str]] = Field(None, description="특정 axis를 단일 값으로 고정 (예: {\"emotion\": \"happy\"})")
    skip_excludes: bool = Field(False, description="DSL 내 exclude 규칙 무시")
    extra_excludes: Optional[List[Dict[str, Any]]] = Field(None, description="추가 제외 규칙")
    limit: int = Field(0, ge=0, description="페이지 크기 (0=전체)")
    offset: int = Field(0, ge=0, description="오프셋")


class ExcludeConditionIn(BaseModel):
    axis: str
    op: Literal["eq", "in", "not_in"] = "eq"
    values: List[str]


class ExcludeRuleIn(BaseModel):
    conditions: List[ExcludeConditionIn]
    connective: Literal["AND", "OR"] = "AND"


class AxisValueOut(BaseModel):
    key: str
    value: str
    props: Dict[str, str] = {}


class AxisOut(BaseModel):
    include: Optional[str] = None
    values: List[AxisValueOut]


class ExcludeConditionOut(BaseModel):
    axis: str
    op: str
    values: List[str]


class ExcludeRuleOut(BaseModel):
    conditions: List[ExcludeConditionOut]
    connective: str = "AND"


class RenderItem(BaseModel):
    filename: str
    prompt: str
    meta: Dict[str, str]


class RenderResponse(BaseModel):
    count: int
    items: List[RenderItem]
    axes: Dict[str, AxisOut] = {}
    sets: Dict[str, str] = {}
    excludes: List[ExcludeRuleOut] = []


class InjectRequest(BaseModel):
    workflow: Dict[str, Any]
    prompt: Union[str, Dict[str, str]] = Field(
        ..., description="문자열 또는 {placeholder: value} 매핑"
    )
    placeholder: str = "{{input}}"


class JobItem(BaseModel):
    filename: str
    prompt: str
    workflow: Dict[str, Any]
    meta: Dict[str, str] = Field(default_factory=dict)
    cegTemplate: str = ""


class JobsCreateRequest(BaseModel):
    items: List[JobItem]


class CurationPatch(BaseModel):
    status: Optional[Literal["pending", "approved", "rejected", "trashed"]] = None
    note: Optional[str] = None


class TagsAddRequest(BaseModel):
    tags: List[str]


class ExportRequest(BaseModel):
    status: Optional[Literal["pending", "approved", "rejected", "trashed"]] = "approved"
    filenames: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    duplicateStrategy: Literal["hash", "number"] = "hash"


class RegenerateRequest(BaseModel):
    count: int = Field(1, ge=1, le=64)
    seedStrategy: Literal["random", "increment"] = "random"
    template: Optional[str] = None
    workflow: Optional[str] = None


class JobsDeleteRequest(BaseModel):
    job_ids: list[str] = Field(..., min_length=1, description="삭제할 잡 ID 목록")


class WorkerCreateRequest(BaseModel):
    url: str = Field(..., description="ComfyUI 서버 URL (http://host:port)")


# ====== lifespan ======


async def _resolve_initial_worker_urls(store: JobStore) -> list[str]:
    """DB → (비어 있으면) env → (그래도 비어 있으면) DEFAULT 시드.

    이후 추가/삭제는 DB가 권위. env는 첫 부팅 시 seed로만 사용.
    """
    urls = await store.list_worker_urls()
    if urls:
        return urls
    env_urls = read_env_worker_urls()
    seed = env_urls or [DEFAULT_COMFYUI_URL]
    for url in seed:
        await store.add_worker_url(url)
    return seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker_pool, job_manager
    store = JobStore()
    await store.open()
    initial_urls = await _resolve_initial_worker_urls(store)
    worker_pool = WorkerPool(urls=initial_urls)
    job_manager = JobManager(worker_pool, store=store)

    async def broadcast(event: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in list(ws_clients):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            ws_clients.discard(ws)

    job_manager.subscribe(broadcast)
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


# ====== 에러 핸들러 ======


@app.exception_handler(DSLSyntaxError)
async def _dsl_error_handler(_request, exc: DSLSyntaxError):
    return JSONResponse(
        status_code=400,
        content={"error": "DSLSyntaxError", "message": str(exc)},
    )


# ====== 헬스/파서 ======

_OBJECT_INFO_PATH = Path(__file__).parent.parent / "object_info.json"


@app.get("/object_info")
async def get_object_info():
    if not _OBJECT_INFO_PATH.exists():
        raise HTTPException(status_code=404, detail="object_info.json not found")
    return FileResponse(_OBJECT_INFO_PATH, media_type="application/json")


@app.get("/version")
def version():
    return {
        "backend": BACKEND_VERSION,
        "bundle": BUNDLE_VERSION,
        "commit": COMMIT,
    }


@app.get("/health")
def health():
    return {
        "backend": "ok",
        "workers": [
            {
                "id": info.id,
                "url": info.url,
                "alive": info.alive,
                "busy": info.busy,
                "currentJobId": info.current_job_id,
            }
            for info in worker_pool.info()
        ],
    }


@app.get("/workers")
def workers_list():
    """현재 등록된 ComfyUI 워커 스냅샷."""
    return {
        "workers": [
            {
                "id": info.id,
                "url": info.url,
                "alive": info.alive,
                "busy": info.busy,
                "currentJobId": info.current_job_id,
            }
            for info in worker_pool.info()
        ],
    }


@app.post("/workers")
async def workers_create(req: WorkerCreateRequest):
    """새 ComfyUI 워커 URL 등록. DB 영속화 + 풀에 추가."""
    try:
        view = await job_manager.add_worker(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"worker": view}


@app.delete("/workers/{worker_id}")
async def workers_delete(worker_id: str, force: bool = False):
    """워커 제거. force=False일 때 진행 중인 잡이 있으면 409로 차단."""
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


@app.post("/render", response_model=RenderResponse)
def render_endpoint(req: RenderRequest):
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
    }


@app.post("/workflow/inject")
def inject_endpoint(req: InjectRequest):
    injected = inject_into_workflow(req.workflow, req.prompt, req.placeholder)
    return {"workflow": injected}


# ====== 잡 ======


@app.post("/jobs")
async def jobs_create(req: JobsCreateRequest):
    items = [item.model_dump() for item in req.items]
    jobs = await job_manager.submit(items)
    return {"jobIds": [j.id for j in jobs]}


@app.get("/jobs")
async def jobs_list(
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    filename: str | None = None,
):
    return await job_manager.query_jobs(
        limit=limit, offset=offset, status=status, filename=filename
    )


@app.delete("/jobs/{job_id}")
async def jobs_cancel(job_id: str):
    ok = await job_manager.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found or already finished")
    return {"ok": True}


@app.post("/jobs/cancel-all")
async def jobs_cancel_all():
    count = await job_manager.cancel_all()
    return {"cancelled": count}


@app.post("/jobs/delete")
async def jobs_delete(req: JobsDeleteRequest):
    """잡 영구 삭제 (DB + 메모리에서 제거)."""
    count = await job_manager.remove_batch(req.job_ids)
    return {"deleted": count}


@app.delete("/jobs/{job_id}/remove")
async def jobs_remove(job_id: str):
    """단일 잡 영구 삭제."""
    ok = await job_manager.remove(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found")
    return {"ok": True}


@app.post("/jobs/{job_id}/retry")
async def jobs_retry(job_id: str):
    """동일한 filename/prompt/workflow로 새 잡을 생성한다."""
    job = await job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    new_jobs = await job_manager.submit([
        {"filename": job.filename, "prompt": job.prompt, "workflow": job.workflow}
    ])
    return {"jobId": new_jobs[0].id}


@app.post("/jobs/pause")
async def jobs_pause():
    await job_manager.set_paused(True)
    return {"paused": True}


@app.post("/jobs/resume")
async def jobs_resume():
    await job_manager.set_paused(False)
    return {"paused": False}


# ====== 잡 로그 ======


@app.get("/jobs/{job_id}/events")
async def job_events(job_id: str):
    """특정 잡의 상태 전환 이력 (audit log)을 반환."""
    events = await job_manager._store.get_job_events(job_id)
    return {"jobId": job_id, "events": events}


@app.get("/jobs/{job_id}/execution-events")
async def job_execution_events(job_id: str):
    """특정 잡의 ComfyUI 실행 이벤트를 반환."""
    events = await job_manager._store.get_execution_events(job_id)
    return {"jobId": job_id, "events": events}


@app.get("/logs")
async def logs_all(
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    worker_id: str | None = None,
):
    """필터링된 전체 job_events 목록을 반환."""
    events = await job_manager._store.get_all_events(
        limit=limit,
        offset=offset,
        status=status,
        worker_id=worker_id,
    )
    return {"events": events, "limit": limit, "offset": offset}


# ====== 이미지 프록시 ======


@app.get("/images/{worker_id}/view")
async def images_view(worker_id: str, filename: str, subfolder: str = "", type: str = "output"):
    worker = worker_pool.get(worker_id)
    if worker is None:
        raise HTTPException(status_code=404, detail="unknown worker")

    async def stream():
        async for chunk in worker.stream_view(
            {"filename": filename, "subfolder": subfolder, "type": type}
        ):
            yield chunk

    media_type = "image/png" if filename.lower().endswith(".png") else "application/octet-stream"
    return StreamingResponse(stream(), media_type=media_type)


# ====== object_info 프록시 ======


@app.get("/object_info")
async def object_info():
    worker = worker_pool.find_idle()
    if worker is None:
        for w in worker_pool.all():
            if w.alive:
                worker = w
                break
    if worker is None:
        raise HTTPException(status_code=503, detail="no available worker")
    try:
        return await worker.get_object_info()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"worker request failed: {exc}")


# ====== 영속 이미지 ======


@app.get("/saved-images")
async def saved_images_list(
    limit: int = 100,
    offset: int = 0,
    job_id: str | None = None,
    status: str | None = None,
    filename: str | None = None,
    tag: str | None = None,
):
    items = await job_manager._store.list_saved_images(
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
    return {"items": items, "limit": limit, "offset": offset, "total": total}


@app.get("/jobs/{job_id}/saved-images")
async def saved_images_for_job(job_id: str):
    items = await job_manager._store.list_saved_images(
        limit=10_000, offset=0, job_id=job_id
    )
    return {"jobId": job_id, "items": items}


@app.get("/saved-images/{hash}")
async def saved_image_serve(hash: str):
    record = await job_manager._store.get_saved_image(hash)
    if record is None:
        raise HTTPException(status_code=404, detail="image not found")
    ext = record.get("extension") or ".png"
    path = DEFAULT_IMAGES_DIR / f"{hash}{ext}"
    if not path.exists():
        raise HTTPException(status_code=404, detail="image file missing on disk")
    media_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(str(path), media_type=media_type)


@app.get("/saved-images/{hash}/meta")
async def saved_image_meta(hash: str):
    record = await job_manager._store.get_saved_image(hash)
    if record is None:
        raise HTTPException(status_code=404, detail="image not found")
    return record


@app.patch("/saved-images/{hash}")
async def saved_image_patch(hash: str, body: CurationPatch):
    updated = await job_manager.update_curation(
        hash, status=body.status, note=body.note
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="image not found")
    return updated


@app.post("/saved-images/{hash}/tags")
async def saved_image_add_tags(hash: str, body: TagsAddRequest):
    tags = await job_manager.add_image_tags(hash, body.tags)
    if tags is None:
        raise HTTPException(status_code=404, detail="image not found")
    return {"hash": hash, "tags": tags}


@app.delete("/saved-images/{hash}/tags/{tag}")
async def saved_image_remove_tag(hash: str, tag: str):
    tags = await job_manager.remove_image_tag(hash, tag)
    if tags is None:
        raise HTTPException(status_code=404, detail="image not found")
    return {"hash": hash, "tags": tags}


@app.post("/saved-images/{hash}/restore")
async def saved_image_restore(hash: str):
    updated = await job_manager.update_curation(hash, status="pending")
    if updated is None:
        raise HTTPException(status_code=404, detail="image not found")
    return updated


@app.get("/tags")
async def tags_list():
    return {"tags": await job_manager._store.list_tag_counts()}


# ====== 휴지통 ======


@app.get("/trash")
async def trash_list(limit: int = 200, offset: int = 0):
    items = await job_manager._store.list_saved_images(
        limit=limit, offset=offset, status="trashed"
    )
    return {"items": items, "limit": limit, "offset": offset}


@app.post("/trash/empty")
async def trash_empty():
    deleted = await job_manager.empty_trash()
    return {"deleted": deleted}


# ====== filename 그룹 ======


@app.get("/asset-groups")
async def asset_groups_list(limit: int = 100, offset: int = 0, sort: str = "latest"):
    groups = await job_manager._store.list_asset_groups(
        limit=limit, offset=offset, sort=sort
    )
    return {"groups": groups, "limit": limit, "offset": offset, "sort": sort}


@app.get("/asset-groups/{filename}")
async def asset_group_detail(filename: str, status: str | None = None):
    items = await job_manager._store.list_saved_images(
        limit=10_000, offset=0, filename=filename, status=status
    )
    return {"filename": filename, "items": items}


@app.post("/asset-groups/{filename}/regenerate")
async def asset_group_regenerate(filename: str, body: RegenerateRequest):
    try:
        jobs = await job_manager.regenerate_group(
            filename,
            count=body.count,
            seed_strategy=body.seedStrategy,
            template=body.template,
            workflow=body.workflow,
        )
        return {"jobIds": [j.id for j in jobs]}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ====== 데이터셋 익스포트 ======


@app.post("/export")
async def export_dataset(body: ExportRequest):
    items_all: list[dict[str, Any]] = []
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
        items_all = [
            it for it in items_all if required.issubset(set(it.get("tags") or []))
        ]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        manifest_lines: list[str] = []
        metadata: list[dict[str, Any]] = []
        used_names: set[str] = set()
        dup_counters: dict[str, int] = {}
        for item in items_all:
            h = item["hash"]
            ext = item.get("extension") or ".png"
            disk_path = DEFAULT_IMAGES_DIR / f"{h}{ext}"
            if not disk_path.exists():
                continue
            orig = item.get("originalFilename") or h
            name = f"{orig}{ext}"
            if name in used_names:
                if body.duplicateStrategy == "number":
                    dup_counters[orig] = dup_counters.get(orig, 0) + 1
                    name = f"{orig}_{dup_counters[orig]}{ext}"
                else:
                    name = f"{orig}_{h[:8]}{ext}"
            used_names.add(name)
            zf.write(disk_path, arcname=f"images/{name}")
            manifest_lines.append(f"{name}\t{item.get('originalFilename','')}")
            metadata.append(
                {
                    "hash": h,
                    "filename": item.get("originalFilename", ""),
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

    buf.seek(0)
    headers = {
        "Content-Disposition": 'attachment; filename="dataset.zip"',
    }
    return StreamingResponse(
        buf, media_type="application/zip", headers=headers
    )


# ====== WebSocket ======


@app.websocket("/ws/events")
async def ws_events(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)
    try:
        # 연결 직후 현재 스냅샷 전송
        snapshot = await job_manager.snapshot()
        worker_infos = [
            {
                "id": info.id,
                "url": info.url,
                "alive": info.alive,
                "busy": info.busy,
                "currentJobId": info.current_job_id,
            }
            for info in worker_pool.info()
        ]
        await websocket.send_json(
            {
                "type": "snapshot",
                "jobs": snapshot,
                "workers": worker_infos,
                "paused": job_manager.paused,
            }
        )
        # 클라이언트가 보내는 메시지는 현재는 무시 (keepalive)
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        ws_clients.discard(websocket)


# ====== 정적 프론트엔드 서빙 (all-in-one 컨테이너 모드) ======
# CEG_STATIC_DIR이 설정되면 같은 프로세스에서 프론트 dist를 직접 서빙한다.
# 이 라우트들은 파일 끝에 두어야 위의 API 라우트가 우선 매칭된다.

_static_dir = os.environ.get("CEG_STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():

    @app.get("/config.js")
    def _config_js() -> Response:
        # All-in-one에선 프론트와 백엔드가 같은 origin. 빈 문자열은 프론트의
        # `globalConfigUrl || DEFAULT`로 가려지므로 location.origin을 박는다.
        return Response(
            "window.COMFY_EMOTION_GEN_BACKEND_URL = window.location.origin;",
            media_type="application/javascript",
        )

    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
