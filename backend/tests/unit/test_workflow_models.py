import pytest
from pydantic import ValidationError

from backend.src.workflow_models import (
    ComfyNode,
    ComfyWorkflow,
    MappingSourceType,
    NodeMapping,
)


# ---------------------------------------------------------------------------
# ComfyNode
# ---------------------------------------------------------------------------

class TestComfyNode:
    def test_valid_construction_minimal(self):
        node = ComfyNode(inputs={"prompt": "hello"}, class_type="KSampler")
        assert node.class_type == "KSampler"
        assert node.inputs == {"prompt": "hello"}
        assert node.meta is None

    def test_valid_construction_with_meta(self):
        node = ComfyNode(
            inputs={"seed": 42},
            class_type="KSampler",
            meta={"title": "sampler"},
        )
        assert node.meta == {"title": "sampler"}

    def test_inputs_accept_various_types(self):
        node = ComfyNode(
            inputs={
                "str_val": "text",
                "int_val": 1,
                "float_val": 3.14,
                "bool_val": True,
                "none_val": None,
                "link_val": ("5", 0),
                "list_val": ["a", 1, None],
                "dict_val": {"key": "value"},
            },
            class_type="MultiInput",
        )
        assert node.inputs["link_val"] == ("5", 0)
        assert node.inputs["list_val"] == ["a", 1, None]
        assert node.inputs["dict_val"] == {"key": "value"}

    def test_missing_class_type_raises_validation_error(self):
        with pytest.raises(ValidationError):
            ComfyNode(inputs={"prompt": "hello"})


# ---------------------------------------------------------------------------
# ComfyWorkflow
# ---------------------------------------------------------------------------

class TestComfyWorkflow:
    def test_roundtrip(self):
        data = {
            "3": ComfyNode(inputs={"seed": 42}, class_type="KSampler"),
            "5": ComfyNode(inputs={"image": ("3", 0)}, class_type="SaveImage"),
        }
        workflow = ComfyWorkflow(root=data)
        assert workflow.root == data

    def test_roundtrip_from_plain_dict(self):
        raw = {
            "3": {"inputs": {"seed": 42}, "class_type": "KSampler"},
            "5": {"inputs": {"image": ("3", 0)}, "class_type": "SaveImage"},
        }
        workflow = ComfyWorkflow(root=raw)
        assert set(workflow.root.keys()) == {"3", "5"}
        assert workflow.root["3"].class_type == "KSampler"
        assert workflow.root["5"].class_type == "SaveImage"

    def test_model_dump_roundtrip(self):
        raw = {
            "3": {"inputs": {"seed": 42}, "class_type": "KSampler"},
            "5": {"inputs": {"image": ("3", 0)}, "class_type": "SaveImage"},
        }
        workflow = ComfyWorkflow(root=raw)
        dumped = workflow.model_dump()
        rebuilt = ComfyWorkflow(root=dumped)
        assert rebuilt.root["3"].class_type == "KSampler"


# ---------------------------------------------------------------------------
# MappingSourceType
# ---------------------------------------------------------------------------

class TestMappingSourceType:
    def test_enum_values(self):
        assert MappingSourceType.PROMPT.value == "prompt"
        assert MappingSourceType.FILENAME.value == "filename"
        assert MappingSourceType.SEED.value == "seed"
        assert MappingSourceType.IMAGE.value == "image"
        assert MappingSourceType.FIXED.value == "fixed"

    def test_enum_membership(self):
        assert "prompt" in [e.value for e in MappingSourceType]
        assert len(list(MappingSourceType)) == 5

    def test_enum_from_value(self):
        assert MappingSourceType("prompt") is MappingSourceType.PROMPT
        assert MappingSourceType("seed") is MappingSourceType.SEED


# ---------------------------------------------------------------------------
# NodeMapping
# ---------------------------------------------------------------------------

class TestNodeMapping:
    def test_minimal_construction(self):
        nm = NodeMapping(
            id="mapping1",
            node_id="3",
            source_type=MappingSourceType.PROMPT,
        )
        assert nm.id == "mapping1"
        assert nm.node_id == "3"
        assert nm.source_type is MappingSourceType.PROMPT
        assert nm.seed_value is None
        assert nm.seed_random is None
        assert nm.fixed_value is None
        assert nm.image_value is None

    def test_defaults_are_none(self):
        nm = NodeMapping(
            id="m1", node_id="5", source_type=MappingSourceType.SEED
        )
        assert nm.seed_value is None
        assert nm.seed_random is None
        assert nm.fixed_value is None
        assert nm.image_value is None

    def test_full_construction(self):
        nm = NodeMapping(
            id="m2",
            node_id="7",
            source_type=MappingSourceType.SEED,
            seed_value=12345,
            seed_random=True,
        )
        assert nm.seed_value == 12345
        assert nm.seed_random is True

    def test_fixed_value_construction(self):
        nm = NodeMapping(
            id="m3",
            node_id="9",
            source_type=MappingSourceType.FIXED,
            fixed_value="my_fixed",
        )
        assert nm.fixed_value == "my_fixed"

    def test_image_value_construction(self):
        nm = NodeMapping(
            id="m4",
            node_id="11",
            source_type=MappingSourceType.IMAGE,
            image_value="path/to/img.png",
        )
        assert nm.image_value == "path/to/img.png"

    def test_json_serialization(self):
        nm = NodeMapping(
            id="m5",
            node_id="3",
            source_type=MappingSourceType.PROMPT,
            seed_random=False,
        )
        json_str = nm.model_dump_json()
        assert '"source_type":"prompt"' in json_str
        assert '"seed_random":false' in json_str

    def test_json_deserialization(self):
        nm = NodeMapping(
            id="m6",
            node_id="5",
            source_type=MappingSourceType.FIXED,
            fixed_value="hero",
        )
        json_str = nm.model_dump_json()
        nm2 = NodeMapping.model_validate_json(json_str)
        assert nm2 == nm

    def test_missing_required_fields_raises_validation_error(self):
        with pytest.raises(ValidationError):
            NodeMapping(id="m7")  # missing node_id and source_type