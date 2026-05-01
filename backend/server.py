"""
백엔드 서버.

역할:
    1) DSL 파서 서버 — POST /render, POST /workflow/inject (디버그/미리보기)
    2) ComfyUI 중계 서버 — 워커 풀(=GPU별 ComfyUI 인스턴스) 관리,
       잡 큐 디스패치, 이미지 프록시, WebSocket 이벤트 브로드캐스트

엔드포인트:
    GET  /health                  - 백엔드 + 워커 풀 상태
    POST /render                  - DSL 템플릿 → 프롬프트 리스트
    POST /workflow/inject         - 워크플로우에 프롬프트 주입
    POST /jobs                    - 잡 N개 등록 (프론트가 시드/치환 박은 워크플로우 제출)
    GET  /jobs                    - 잡 스냅샷
    DELETE /jobs/{id}             - 잡 취소
    GET  /images/{worker_id}/view - ComfyUI view 프록시
    WS   /ws/events               - 정규화 이벤트 스트림
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Union

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from prompt_dsl import DSLSyntaxError, parse, render, inject_into_workflow
from worker_pool import WorkerPool
from jobs import JobManager

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
    version="0.1.0",
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


@app.post("/jobs/pause")
async def jobs_pause():
    await job_manager.set_paused(True)
    return {"paused": True}


@app.post("/jobs/resume")
async def jobs_resume():
    await job_manager.set_paused(False)
    return {"paused": False}


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
