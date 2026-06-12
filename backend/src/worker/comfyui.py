"""
ComfyUI 워커 클라이언트.

각 인스턴스는 ComfyUI 서버 1개(보통 GPU 1개)에 대응한다.
- HTTP: /prompt 제출, /interrupt 취소, /view 프록시 위해 base_url 노출
- WebSocket: ws/events 스트림 구독. 끊기면 지수 백오프 재연결

상위 계층(WorkerPool/Dispatcher)이 이 클라이언트의 메시지를 받아
잡 단위로 정규화한다.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator, Optional, cast

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

from backend.src.worker import BaseWorker, RawMessageHandler, BinaryMessageHandler, StatusChangeHandler
from backend.src.models import JSONValue
from backend.src.workflow_models import ComfyWorkflow

logger = logging.getLogger(__name__)


class ComfyWorker(BaseWorker):
    """
    단일 ComfyUI 서버에 대한 클라이언트.

    `start()` 호출 시 백그라운드 태스크로 WebSocket 구독을 시작하고,
    raw 메시지를 등록된 핸들러로 전달한다.
    """

    INITIAL_BACKOFF = 1.0
    MAX_BACKOFF = 30.0

    def __init__(
        self,
        worker_id: str,
        base_url: str,
        *,
        worker_type: str = "comfyui",
        on_message: Optional[RawMessageHandler] = None,
        on_binary: Optional[BinaryMessageHandler] = None,
        on_status_change: Optional[StatusChangeHandler] = None,
    ) -> None:
        super().__init__(
            worker_id=worker_id,
            base_url=base_url,
            worker_type=worker_type,
        )
        # 핸들러는 외부(WorkerPool._apply_handlers)에서도 설정됨
        self._on_message = on_message
        self._on_binary = on_binary
        self._on_status_change = on_status_change

        self._http = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self._ws_task: Optional[asyncio.Task[None]] = None
        self._stopping = False

        self._sid: Optional[str] = None

    # ---------- ComfyUI 전용 속성 ----------

    @property
    def sid(self) -> Optional[str]:
        return self._sid

    # ---------- lifecycle ----------

    async def start(self) -> None:
        if self._ws_task is not None:
            return
        self._stopping = False
        self._ws_task = asyncio.create_task(self._ws_loop(), name=f"ws:{self.id}")

    async def stop(self) -> None:
        self._stopping = True
        if self._ws_task is not None:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except (asyncio.CancelledError, Exception):
                pass
            self._ws_task = None
        try:
            await self._http.aclose()
        except Exception:
            logger.warning("worker %s failed to close HTTP client", self.id)

    # ---------- HTTP ----------

    async def submit_prompt(
        self,
        *,
        prompt: ComfyWorkflow,
        prompt_id: str,
    ) -> None:
        """ComfyUI /prompt 호출. client_id는 워커 ws sid 사용."""
        if self._sid is None:
            raise RuntimeError(f"worker {self.id} has no sid yet")
        resp = await self._http.post(
            "/prompt",
            json={
                "prompt": prompt.model_dump(exclude_none=True),
                "client_id": self._sid,
                "prompt_id": prompt_id,
            },
        )
        resp.raise_for_status()

    async def interrupt(self) -> None:
        try:
            resp = await self._http.post("/interrupt")
            resp.raise_for_status()
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning("worker %s interrupt failed: %s", self.id, exc)

    async def delete_from_queue(self, prompt_id: str) -> None:
        """ComfyUI pending 큐에서 특정 prompt 제거 (실행 중이면 no-op)."""
        try:
            resp = await self._http.post("/queue", json={"delete": [prompt_id]})
            resp.raise_for_status()
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning("worker %s delete_from_queue(%s) failed: %s", self.id, prompt_id, exc)

    async def clear_queue(self) -> None:
        """ComfyUI pending 큐 전체 비우기."""
        try:
            resp = await self._http.post("/queue", json={"clear": True})
            resp.raise_for_status()
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning("worker %s clear_queue failed: %s", self.id, exc)

    async def stream_output(self, params: dict[str, str]) -> AsyncGenerator[bytes, None]:
        """BaseWorker.stream_output의 ComfyUI 구현 (/view 엔드포인트)."""
        async with self._http.stream("GET", "/view", params=params) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk

    async def upload_image(
        self,
        *,
        file_data: bytes,
        filename: str,
        subfolder: str = "",
    ) -> str:
        """POST /upload/image to the ComfyUI server. Returns the image name."""
        resp = await self._http.post(
            "/upload/image",
            data={"subfolder": subfolder},
            files={"image": (filename, file_data)},
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            name = data.get("name")
            if isinstance(name, str):
                return name
        return filename

    async def get_object_info(self) -> dict[str, JSONValue]:
        """GET /object_info from the ComfyUI server."""
        resp = await self._http.get("/object_info")
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            return cast(dict[str, JSONValue], data)
        return {}

    async def get_extensions(self) -> list[str]:
        """GET /extensions from the ComfyUI server."""
        try:
            resp = await self._http.get("/extensions")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return cast(list[str], data)
        except Exception as exc:
            logger.warning("worker %s get_extensions failed: %s", self.id, exc)
        return []

    # ---------- WebSocket loop ----------

    async def _ws_loop(self) -> None:
        backoff = self.INITIAL_BACKOFF
        ws_url = self.base_url.replace("http://", "ws://").replace(
            "https://", "wss://"
        ) + "/ws"

        while not self._stopping:
            try:
               
                async with websockets.connect(ws_url, max_size=None) as ws:
                    await self._set_alive(True)
                    backoff = self.INITIAL_BACKOFF
                   
                    async for message in ws:
                        if isinstance(message, (bytes, bytearray)):
                       
                            if self._on_binary is not None:
                                try:
                                    await self._on_binary(self, bytes(message))
                                except Exception:
                                    logger.exception("binary handler error in worker %s", self.id)
                  
                            continue
                        try:
                            payload = json.loads(message)
                        except json.JSONDecodeError:
                            logger.warning("worker %s non-json message", self.id)
                            continue
                        # status 메시지에서 sid 추출
                        if (
                            payload.get("type") == "status"
                            and isinstance(payload.get("data"), dict)
                            and payload["data"].get("sid")
                        ):
                            self._sid = payload["data"]["sid"]
                        if self._on_message is not None:
                            try:
                                await self._on_message(self, payload)
                            except Exception:
                                logger.exception("message handler error in worker %s", self.id)
            except asyncio.CancelledError:
                raise
            except (ConnectionClosed, OSError) as exc:
                logger.info(
                    "worker %s ws closed: %s (reconnect in %.1fs)",
                    self.id,
                    exc,
                    backoff,
                )
                await self._set_alive(False)
                if self._stopping:
                    break
                try:
                    await asyncio.sleep(backoff)
                except asyncio.CancelledError:
                    break
                backoff = min(backoff * 2, self.MAX_BACKOFF)
            except Exception:
                logger.exception("worker %s ws unexpected error (reconnect in %.1fs)", self.id, backoff)
                await self._set_alive(False)
                if self._stopping:
                    break
                try:
                    await asyncio.sleep(backoff)
                except asyncio.CancelledError:
                    break
                backoff = min(backoff * 2, self.MAX_BACKOFF)

        await self._set_alive(False)

    async def _set_alive(self, alive: bool) -> None:
        if self._alive == alive:
            return
        self._alive = alive
        if not alive:
            self._sid = None
        if self._on_status_change is not None:
            try:
                await self._on_status_change(self)
            except Exception:
                logger.exception("status_change handler error in worker %s", self.id)