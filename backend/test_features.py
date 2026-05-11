

import pytest
from prompt_dsl import parse, render, inject_into_workflow


@pytest.fixture
def mock_workflow():
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {"seed": 12345, "steps": 20},
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "{{input}}, masterpiece", "clip": ["4", 1]},
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "bad anatomy, blurry", "clip": ["4", 1]},
        },
    }


# ====== TEST 1: ComfyUI 워크플로우 주입 ======

class TestWorkflowInjection:
    def test_single_placeholder_injection(self, mock_workflow):
        prompt = "1girl, silver hair, school uniform, smiling"
        injected = inject_into_workflow(mock_workflow, prompt)

        assert injected["6"]["inputs"]["text"] == f"{prompt}, masterpiece"

    def test_injection_does_not_touch_unrelated_nodes(self, mock_workflow):
        injected = inject_into_workflow(mock_workflow, "anything")
        assert injected["7"]["inputs"]["text"] == "bad anatomy, blurry"
        assert injected["3"]["inputs"]["seed"] == 12345

    def test_injection_is_non_destructive(self, mock_workflow):
        inject_into_workflow(mock_workflow, "test prompt")
        assert mock_workflow["6"]["inputs"]["text"] == "{{input}}, masterpiece"


class TestMultiPlaceholder:
    def test_positive_negative_split(self):
        wf = {
            "positive_node": {"inputs": {"text": "{{positive}}, masterpiece"}},
            "negative_node": {"inputs": {"text": "{{negative}}"}},
        }
        injected = inject_into_workflow(wf, {
            "{{positive}}": "1girl, elegant dress, smiling",
            "{{negative}}": "low quality, watermark",
        })

        assert "1girl, elegant dress, smiling" in injected["positive_node"]["inputs"]["text"]
        assert injected["negative_node"]["inputs"]["text"] == "low quality, watermark"


