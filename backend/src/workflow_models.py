from enum import StrEnum, auto
from typing import Optional

from pydantic import BaseModel, RootModel

NodeLink = tuple[str, int]

type NodeInputValue = (
    str | int | float | bool | None | NodeLink | list["NodeInputValue"] | dict[str, "NodeInputValue"]
)

class ComfyNode(BaseModel):
    inputs: dict[str, NodeInputValue]
    class_type: str
    meta: Optional[dict[str, str]] = None

class ComfyWorkflow(RootModel[dict[str, ComfyNode]]):
    pass


class MappingSourceType(StrEnum):
    PROMPT = auto()
    FILENAME = auto()
    SEED = auto()
    IMAGE = auto()
    FIXED = auto()


class NodeMapping(BaseModel):
    """
    노드매핑 데이터 클래스
    """
    id: str
    node_id: str
    source_type: MappingSourceType
    seed_value: Optional[int] = None
    seed_random: Optional[bool] = None
    fixed_value: Optional[str] = None
    image_value: Optional[str] = None
