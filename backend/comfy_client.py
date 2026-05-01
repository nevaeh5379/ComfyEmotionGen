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
from dataclasses import dataclass
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)


RawMessageHandler = Callable[["ComfyWorker", dict[str, Any]], Awaitable[None]]
BinaryMessageHandler = Callable[["ComfyWorker", bytes], Awaitable[None]]
StatusChangeHandler = Callable[["ComfyWorker"], Awaitable[None]]


@dataclass
class WorkerInfo:
    id: str
    url: str
    alive: bool
    busy: bool
    current_job_id: Optional[str]


class ComfyWorker:
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
        on_message: Optional[RawMessageHandler] = None,
        on_binary: Optional[BinaryMessageHandler] = None,
        on_status_change: Optional[StatusChangeHandler] = None,
    ) -> None:
        self.id = worker_id
        self.base_url = base_url.rstrip("/")
        self._on_message = on_message
        self._on_binary = on_binary
        self._on_status_change = on_status_change

        self._http = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self._ws_task: Optional[asyncio.Task[None]] = None
        self._stopping = False

        self._alive = False
        self._sid: Optional[str] = None
        # busy/current_job_id는 Dispatcher가 관리 (워커는 자기 상태만)
        self.current_job_id: Optional[str] = None

    # ---------- public state ----------

    @property
    def alive(self) -> bool:
        return self._alive

    @property
    def busy(self) -> bool:
        return self.current_job_id is not None

    @property
    def sid(self) -> Optional[str]:
        return self._sid

    def info(self) -> WorkerInfo:
        return WorkerInfo(
            id=self.id,
            url=self.base_url,
            alive=self._alive,
            busy=self.busy,
            current_job_id=self.current_job_id,
        )

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
        await self._http.aclose()

    # ---------- HTTP ----------

    async def submit_prompt(
        self,
        *,
        prompt: dict[str, Any],
        prompt_id: str,
    ) -> None:
        """ComfyUI /prompt 호출. client_id는 워커 ws sid 사용."""
        if self._sid is None:
            raise RuntimeError(f"worker {self.id} has no sid yet")
        resp = await self._http.post(
            "/prompt",
            json={
                "prompt": prompt,
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

    async def stream_view(self, params: dict[str, str]) -> AsyncIterator[bytes]:
        """ComfyUI /view 스트리밍 (이미지 프록시용)."""
        async with self._http.stream("GET", "/view", params=params) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk

    # ---------- WebSocket loop ----------

    async def _ws_loop(self) -> None:
        backoff = self.INITIAL_BACKOFF
        ws_url = self.base_url.replace("http://", "ws://").replace(
            "https://", "wss://"
        ) + "/ws"

        while not self._stopping:
            try:
                logger.info("worker %s connecting %s", self.id, ws_url)
                async with websockets.connect(ws_url, max_size=None) as ws:
                    await self._set_alive(True)
                    backoff = self.INITIAL_BACKOFF
                    async for message in ws:
                        if isinstance(message, (bytes, bytearray)):
                            if self._on_binary is not None:
                                await self._on_binary(self, bytes(message))
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
                            await self._on_message(self, payload)
            except asyncio.CancelledError:
                raise
            except (ConnectionClosed, OSError, Exception) as exc:
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

        await self._set_alive(False)

    async def _set_alive(self, alive: bool) -> None:
        if self._alive == alive:
            return
        self._alive = alive
        if not alive:
            self._sid = None
        if self._on_status_change is not None:
            await self._on_status_change(self)
