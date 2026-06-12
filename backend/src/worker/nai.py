"""
NovelAI (NAI) 워커 클라이언트 — 스켈레톤.

실제 NAI API 연동은 별도 작업에서 구현한다.
현재는 BaseWorker 인터페이스를 만족하는 최소 구현만 제공한다.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncGenerator, Optional

import httpx

from backend.src.worker import BaseWorker, RawMessageHandler, BinaryMessageHandler, StatusChangeHandler
from backend.src.models import JSONValue
from backend.src.workflow_models import ComfyWorkflow

logger = logging.getLogger(__name__)


class NAIWorker(BaseWorker):
    """
    NovelAI API 워커 (스켈레톤).

    NAI는 HTTP REST API 기반이며 WebSocket이 필요 없다.
    start() 시 HTTP 세션만 열고, submit_prompt() 시
    이미지 생성 요청을 보낸다.
    """

    def __init__(
        self,
        worker_id: str,
        base_url: str,
        *,
        worker_type: str = "nai",
        api_key: Optional[str] = None,
        on_message: Optional[RawMessageHandler] = None,
        on_binary: Optional[BinaryMessageHandler] = None,
        on_status_change: Optional[StatusChangeHandler] = None,
    ) -> None:
        super().__init__(
            worker_id=worker_id,
            base_url=base_url,
            worker_type=worker_type,
        )
        self._api_key = api_key
        self._on_message = on_message
        self._on_binary = on_binary
        self._on_status_change = on_status_change
        self._http: Optional[httpx.AsyncClient] = None

    # ---------- lifecycle ----------

    async def start(self) -> None:
        """HTTP 클라이언트 세션 시작."""
        if self._http is not None:
            return
        headers = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=120.0,  # 이미지 생성은 오래 걸릴 수 있음
        )
        # 간단한 health check
        try:
            resp = await self._http.get("/")
            if resp.status_code < 500:
                await self._set_alive(True)
                logger.info("NAI worker %s connected to %s", self.id, self.base_url)
        except Exception:
            logger.warning("NAI worker %s failed health check on %s", self.id, self.base_url, exc_info=True)

    async def stop(self) -> None:
        """HTTP 세션 종료."""
        if self._http is not None:
            try:
                await self._http.aclose()
            except Exception:
                logger.warning("NAI worker %s failed to close HTTP session", self.id)
            self._http = None
        await self._set_alive(False)

    async def _set_alive(self, alive: bool) -> None:
        if self._alive == alive:
            return
        self._alive = alive
        if self._on_status_change is not None:
            try:
                await self._on_status_change(self)
            except Exception:
                logger.exception("status_change handler error in NAI worker %s", self.id)

    # ---------- abstract method implementations ----------

    async def submit_prompt(
        self,
        *,
        prompt: ComfyWorkflow,
        prompt_id: str,
    ) -> None:
        """NAI 이미지 생성 요청 (TODO: 실제 API 스펙에 맞게 구현)."""
        if self._http is None:
            raise RuntimeError(f"NAI worker {self.id} not started")
        raise NotImplementedError("NAI submit_prompt not yet implemented")

    async def interrupt(self) -> None:
        """NAI는 진행 중인 요청을 취소하는 API가 없을 수 있음 (best-effort)."""
        logger.warning("NAI worker %s interrupt: no-op (not implemented)", self.id)

    async def stream_output(self, params: dict[str, str]) -> AsyncGenerator[bytes, None]:
        """NAI 결과 이미지 스트리밍 (TODO: 실제 API에 맞게 구현)."""
        if self._http is None:
            raise RuntimeError(f"NAI worker {self.id} not started")
        raise NotImplementedError("NAI stream_output not yet implemented")
        yield b""

    async def delete_from_queue(self, prompt_id: str) -> None:
        """NAI는 큐 관리 API가 없으므로 no-op."""
        pass

    async def clear_queue(self) -> None:
        """NAI는 큐 관리 API가 없으므로 no-op."""
        pass

    async def upload_image(
        self,
        *,
        file_data: bytes,
        filename: str,
        subfolder: str = "",
    ) -> str:
        """NAI 이미지 업로드 (TODO: 실제 API에 맞게 구현)."""
        raise NotImplementedError("NAI upload_image not yet implemented")

    async def get_object_info(self) -> dict[str, JSONValue]:
        """NAI는 커스텀 노드가 없으므로 빈 오브젝트 반환."""
        return {}