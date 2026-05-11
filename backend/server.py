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
    GET  /jobs                         - 잡 스냅샷
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
    WS   /ws/events                    - 정규화 이벤트 스트림
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import mimetypes
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from prompt_dsl import DSLSyntaxError, parse, render, inject_into_workflow
from worker_pool import WorkerPool
from jobs import JobManager, DEFAULT_IMAGES_DIR
from _version import BACKEND_VERSION, BUNDLE_VERSION, COMMIT

logger = logging.getLogger(__name__)


# ====== 전역 상태 (lifespan에서 초기화) ======

worker_pool: WorkerPool
job_manager: JobManager
ws_clients: set[WebSocket] = set()


# ====== Pydantic 모델 ======


class RenderRequest(BaseModel):
    template: str = Field(..., description="DSL 템플릿 소스")


class RenderItem(BaseModel):
    filename: str
    prompt: str
    meta: Dict[str, str]


class RenderResponse(BaseModel):
    count: int
    items: List[RenderItem]


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


class RegenerateRequest(BaseModel):
    count: int = Field(1, ge=1, le=64)
    seedStrategy: Literal["random", "increment"] = "random"


# ====== lifespan ======


@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker_pool, job_manager
    worker_pool = WorkerPool()
    job_manager = JobManager(worker_pool)

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


@app.post("/render", response_model=RenderResponse)
def render_endpoint(req: RenderRequest):
    prog = parse(req.template)
    items = render(prog)
    return {"count": len(items), "items": items}


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
async def jobs_list():
    return {"jobs": await job_manager.snapshot()}


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
            filename, count=body.count, seed_strategy=body.seedStrategy
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"jobIds": [j.id for j in jobs]}


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
        for item in items_all:
            h = item["hash"]
            ext = item.get("extension") or ".png"
            disk_path = DEFAULT_IMAGES_DIR / f"{h}{ext}"
            if not disk_path.exists():
                continue
            zf.write(disk_path, arcname=f"images/{h}{ext}")
            manifest_lines.append(f"{h}{ext}\t{item.get('originalFilename','')}")
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
