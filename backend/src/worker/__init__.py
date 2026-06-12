"""
워커 백엔드 공통 모델 및 추상 베이스 클래스.

각 백엔드 타입(ComfyUI, NAI 등)은 BaseWorker ABC를 구현한 클래스를
제공하고, WORKER_REGISTRY에 등록한다.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator, Awaitable, Callable, Optional

from backend.src.models import JSONValue
from backend.src.workflow_models import ComfyWorkflow


@dataclass
class WorkerInfo:
    """모든 워커 타입이 공유하는 상태 정보."""
    id: str
    url: str
    alive: bool
    busy: bool
    current_job_id: Optional[str]
    worker_type: str = "comfyui"


# 타입 별칭 — 핸들러 시그니처
RawMessageHandler = Callable[["BaseWorker", dict[str, JSONValue]], Awaitable[None]]
BinaryMessageHandler = Callable[["BaseWorker", bytes], Awaitable[None]]
StatusChangeHandler = Callable[["BaseWorker"], Awaitable[None]]


class BaseWorker(ABC):
    """
    이미지 생성 백엔드 워커의 공통 인터페이스.

    각 백엔드(ComfyUI, NAI, SD-WebUI 등)는 이 클래스를 상속하여 구현한다.
    """

    def __init__(self, worker_id: str, base_url: str, worker_type: str) -> None:
        self.id = worker_id
        self.base_url = base_url.rstrip("/")
        self._worker_type = worker_type

        self._on_message: Optional[RawMessageHandler] = None
        self._on_binary: Optional[BinaryMessageHandler] = None
        self._on_status_change: Optional[StatusChangeHandler] = None

        self._alive = False
        self.current_job_id: Optional[str] = None

    # ---------- 공통 속성 ----------

    @property
    def alive(self) -> bool:
        return self._alive

    @property
    def busy(self) -> bool:
        return self.current_job_id is not None

    @property
    def worker_type(self) -> str:
        return self._worker_type

    # ---------- 공통 메서드 ----------

    def info(self) -> WorkerInfo:
        return WorkerInfo(
            id=self.id,
            url=self.base_url,
            alive=self._alive,
            busy=self.busy,
            current_job_id=self.current_job_id,
            worker_type=self._worker_type,
        )

    # ---------- 추상 메서드 ----------

    @abstractmethod
    async def start(self) -> None:
        """워커 연결 시작 (WebSocket, HTTP 세션 등)."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """워커 연결 종료 및 리소스 정리."""
        ...

    @abstractmethod
    async def submit_prompt(
        self,
        *,
        prompt: ComfyWorkflow,
        prompt_id: str,
    ) -> None:
        """잡을 워커에 제출."""
        ...

    @abstractmethod
    async def interrupt(self) -> None:
        """현재 실행 중인 잡 중단 (best-effort)."""
        ...

    @abstractmethod
    async def stream_output(self, params: dict[str, str]) -> AsyncGenerator[bytes, None]:
        """생성 결과(이미지 등)를 스트리밍으로 가져오기."""
        yield ...  # type: ignore[misc]  # 추상 비동기 제너레이터 플레이스홀더

    @abstractmethod
    async def delete_from_queue(self, prompt_id: str) -> None:
        """워커의 대기 큐에서 특정 잡 제거 (best-effort)."""
        ...

    @abstractmethod
    async def clear_queue(self) -> None:
        """워커의 대기 큐 전체 비우기 (best-effort)."""
        ...

    @abstractmethod
    async def upload_image(
        self,
        *,
        file_data: bytes,
        filename: str,
        subfolder: str = "",
    ) -> str:
        """워커에 이미지 업로드 후 서버측 이름 반환."""
        ...

    @abstractmethod
    async def get_object_info(self) -> dict[str, JSONValue]:
        """워커의 노드 정의(object_info) 조회."""
        ...

    # 후방 호환 별칭
    # stream_view = stream_output


# 백엔드 타입 → 워커 클래스 매핑 (지연 임포트로 순환 참조 방지)
def _build_registry() -> dict[str, type[BaseWorker]]:
    from backend.src.worker.comfyui import ComfyWorker
    from backend.src.worker.nai import NAIWorker
    return {
        "comfyui": ComfyWorker,
        "nai": NAIWorker,
    }


WORKER_REGISTRY: dict[str, type[BaseWorker]] = _build_registry()
DEFAULT_WORKER_TYPE = "comfyui"