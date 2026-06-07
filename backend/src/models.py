"""
잡 관련 Pydantic 요청 모델.
server.py ↔ jobs.py 순환 임포트 해결을 위해 분리됨.
"""
from __future__ import annotations

from enum import StrEnum, auto
from typing import Dict

from pydantic import BaseModel, Field

from backend.src.workflow_models import ComfyWorkflow


class WorkerType(StrEnum):
    COMFYUI = auto()
    NAI = auto()


class JobStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    CANCELLED = "cancelled"


class JobItem(BaseModel):
    filename: str
    prompt: str
    # workflow: Dict[str, Any]
    workflow: ComfyWorkflow | None
    meta: Dict[str, str] = Field(default_factory=dict)
    cegTemplate: str = ""
    imageUploads: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    workerType: WorkerType