"""
NovelAI (NAI) 워커 클라이언트 — 스켈레톤.

실제 NAI API 연동은 별도 작업에서 구현한다.
현재는 BaseWorker 인터페이스를 만족하는 최소 구현만 제공한다.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncGenerator, Optional

import httpx

from backend.src.worker import BaseWorker

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
        api_key: Optional[str] = None,
        on_message=None,
        on_binary=None,
        on_status_change=None,
    ) -> None:
        super().__init__(
            worker_id=worker_id,
            base_url=base_url,
            worker_type="nai",
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
            logger.warning("NAI worker %s failed health check on %s", self.id, self.base_url)

    async def stop(self) -> None:
        """HTTP 세션 종료."""
        if self._http is not None:
            await self._http.aclose()
            self._http = None
        await self._set_alive(False)

    async def _set_alive(self, alive: bool) -> None:
        if self._alive == alive:
            return
        self._alive = alive
        if self._on_status_change is not None:
            await self._on_status_change(self)

    # ---------- abstract method implementations ----------

    async def submit_prompt(
        self,
        *,
        prompt: dict[str, Any],
        prompt_id: str,
    ) -> None:
        """NAI 이미지 생성 요청 (TODO: 실제 API 스펙에 맞게 구현)."""
        if self._http is None:
            raise RuntimeError(f"NAI worker {self.id} not started")
        logger.info("NAI worker %s submit_prompt %s (not yet implemented)", self.id, prompt_id)
        # TODO: 실제 NAI API 엔드포인트 호출
        # 예: resp = await self._http.post("/ai/generate-image", json={...})

    async def interrupt(self) -> None:
        """NAI는 진행 중인 요청을 취소하는 API가 없을 수 있음 (best-effort)."""
        logger.warning("NAI worker %s interrupt: no-op (not implemented)", self.id)

    async def stream_output(self, params: dict[str, str]) -> AsyncGenerator[bytes, None]:
        """NAI 결과 이미지 스트리밍 (TODO: 실제 API에 맞게 구현)."""
        if self._http is None:
            raise RuntimeError(f"NAI worker {self.id} not started")
        # TODO: NAI는 생성 완료 후 이미지 URL을 반환하므로
        # stream_output 대신 결과를 polling 후 다운로드하는 방식 필요
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

    async def get_object_info(self) -> dict[str, Any]:
        """NAI는 노드 정의가 없으므로 빈 dict 반환."""
        return {}