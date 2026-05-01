"""
ComfyUI 워커 풀.

환경변수 COMFYUI_WORKERS에서 콤마 구분 URL 리스트를 읽어 워커들을 생성·관리한다.
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


def _read_worker_urls() -> list[str]:
    raw = os.environ.get(ENV_KEY)
    if not raw:
        return [DEFAULT_COMFYUI_URL]
    urls = [u.strip() for u in raw.split(",") if u.strip()]
    return urls or [DEFAULT_COMFYUI_URL]


class WorkerPool:
    """워커 컬렉션. 라우팅과 생명주기 관리만 담당 (스케줄링은 Dispatcher)."""

    def __init__(self, urls: Optional[Iterable[str]] = None) -> None:
        url_list = list(urls) if urls is not None else _read_worker_urls()
        self._workers: dict[str, ComfyWorker] = {}
        for index, url in enumerate(url_list):
            worker_id = f"worker-{index}"
            self._workers[worker_id] = ComfyWorker(worker_id, url)

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
        """모든 워커에 동일한 핸들러를 연결."""
        for worker in self._workers.values():
            worker._on_message = on_message  # noqa: SLF001
            worker._on_binary = on_binary  # noqa: SLF001
            worker._on_status_change = on_status_change  # noqa: SLF001

    # ---------- lifecycle ----------

    async def start(self) -> None:
        for worker in self._workers.values():
            await worker.start()

    async def stop(self) -> None:
        for worker in self._workers.values():
            await worker.stop()

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
