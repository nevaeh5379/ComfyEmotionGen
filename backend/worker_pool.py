"""
ComfyUI 워커 풀.

환경변수 COMFYUI_WORKERS에서 콤마 구분 URL 리스트를 읽어 초기 워커를 만들고,
런타임에 add/remove로 동적으로 워커를 추가·제거할 수 있다.
- 단일 GPU 환경: 그냥 URL 1개
- 멀티 GPU: 각 GPU에 대응하는 ComfyUI 인스턴스 URL을 콤마로 나열

  COMFYUI_WORKERS=http://localhost:8188,http://localhost:8189
"""

from __future__ import annotations

import logging
import os
from typing import Awaitable, Callable, Iterable, Optional

from comfy_client import ComfyWorker, WorkerInfo

logger = logging.getLogger(__name__)


DEFAULT_COMFYUI_URL = "http://localhost:8188"
ENV_KEY = "COMFYUI_WORKERS"


def read_env_worker_urls() -> list[str]:
    """COMFYUI_WORKERS 환경변수 파싱. 비어 있으면 빈 리스트."""
    raw = os.environ.get(ENV_KEY)
    if not raw:
        return []
    return [u.strip() for u in raw.split(",") if u.strip()]


class WorkerPool:
    """워커 컬렉션. 라우팅과 생명주기 관리만 담당 (스케줄링은 Dispatcher)."""

    def __init__(self, urls: Optional[Iterable[str]] = None) -> None:
        self._workers: dict[str, ComfyWorker] = {}
        self._next_index = 0
        self._on_message: Optional[Callable[[ComfyWorker, dict], Awaitable[None]]] = None
        self._on_binary: Optional[Callable[[ComfyWorker, bytes], Awaitable[None]]] = None
        self._on_status_change: Optional[Callable[[ComfyWorker], Awaitable[None]]] = None

        url_list: list[str] = list(urls) if urls is not None else read_env_worker_urls()
        if not url_list:
            url_list = [DEFAULT_COMFYUI_URL]
        for url in url_list:
            self._create_worker(url)

    # ---------- handler wiring ----------

    def set_handlers(
        self,
        *,
        on_message: Optional[
            Callable[[ComfyWorker, dict], Awaitable[None]]
        ] = None,
        on_binary: Optional[Callable[[ComfyWorker, bytes], Awaitable[None]]] = None,
        on_status_change: Optional[Callable[[ComfyWorker], Awaitable[None]]] = None,
    ) -> None:
        """모든 워커에 동일한 핸들러를 연결. 이후 add()되는 워커에도 자동 적용."""
        self._on_message = on_message
        self._on_binary = on_binary
        self._on_status_change = on_status_change
        for worker in self._workers.values():
            self._apply_handlers(worker)

    def _apply_handlers(self, worker: ComfyWorker) -> None:
        worker._on_message = self._on_message  # noqa: SLF001
        worker._on_binary = self._on_binary  # noqa: SLF001
        worker._on_status_change = self._on_status_change  # noqa: SLF001

    def _create_worker(self, url: str) -> ComfyWorker:
        worker_id = f"worker-{self._next_index}"
        self._next_index += 1
        worker = ComfyWorker(worker_id, url)
        self._apply_handlers(worker)
        self._workers[worker_id] = worker
        return worker

    # ---------- lifecycle ----------

    async def start(self) -> None:
        for worker in self._workers.values():
            await worker.start()

    async def stop(self) -> None:
        for worker in self._workers.values():
            await worker.stop()

    # ---------- dynamic add/remove ----------

    def has_url(self, url: str) -> bool:
        normalized = url.rstrip("/")
        return any(w.base_url == normalized for w in self._workers.values())

    async def add(self, url: str) -> ComfyWorker:
        """새 URL로 워커 생성·시작. 중복 URL이면 ValueError."""
        if self.has_url(url):
            raise ValueError(f"URL already registered: {url}")
        worker = self._create_worker(url)
        await worker.start()
        return worker

    async def remove(self, worker_id: str) -> Optional[ComfyWorker]:
        """워커 풀에서 제거하고 WS/HTTP 자원 정리. 반환값으로 제거된 워커."""
        worker = self._workers.pop(worker_id, None)
        if worker is None:
            return None
        await worker.stop()
        return worker

    # ---------- access ----------

    def all(self) -> list[ComfyWorker]:
        return list(self._workers.values())

    def get(self, worker_id: str) -> Optional[ComfyWorker]:
        return self._workers.get(worker_id)

    def find_idle(self) -> Optional[ComfyWorker]:
        """첫 번째 alive & idle 워커 반환."""
        for worker in self._workers.values():
            if worker.alive and not worker.busy:
                return worker
        return None

    def info(self) -> list[WorkerInfo]:
        return [w.info() for w in self._workers.values()]
