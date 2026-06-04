from enum import StrEnum, auto
from typing import  Optional, Union

from pydantic import BaseModel, RootModel

NodeLink = tuple[str, int]

NodeInputValue = Union[
    str,
    int,
    float,
    bool,
    None,
    NodeLink,
    list["NodeInputValue"],
    dict[str, "NodeInputValue"]
]

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
    seed_value: Optional[int]
    seed_random: Optional[bool]
    fixed_value: Optional[str]
    image_value: Optional[str]
