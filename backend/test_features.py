

from typing import Any, cast

import pytest
from prompt_dsl import inject_into_workflow


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
        injected = cast(dict[str, Any], inject_into_workflow(mock_workflow, prompt))

        assert injected["6"]["inputs"]["text"] == f"{prompt}, masterpiece"

    def test_injection_does_not_touch_unrelated_nodes(self, mock_workflow):
        injected = cast(dict[str, Any], inject_into_workflow(mock_workflow, "anything"))
        assert injected["7"]["inputs"]["text"] == "bad anatomy, blurry"
        assert injected["3"]["inputs"]["seed"] == 12345

    def test_injection_is_non_destructive(self, mock_workflow):
        inject_into_workflow(mock_workflow, "test prompt")
        assert mock_workflow["6"]["inputs"]["text"] == "{{input}}, masterpiece"


class TestMultiPlaceholder:
    def test_positive_negative_split(self):
        wf: dict[str, Any] = {
            "positive_node": {"inputs": {"text": "{{positive}}, masterpiece"}},
            "negative_node": {"inputs": {"text": "{{negative}}"}},
        }
        injected = cast(dict[str, Any], inject_into_workflow(wf, {
            "{{positive}}": "1girl, elegant dress, smiling",
            "{{negative}}": "low quality, watermark",
        }))

        assert "1girl, elegant dress, smiling" in injected["positive_node"]["inputs"]["text"]
        assert injected["negative_node"]["inputs"]["text"] == "low quality, watermark"


class TestOptionalAxisAndSubstitution:
    def test_parse_optional_axis(self):
        from prompt_dsl import parse, render
        src = """
        {{axis mood?}}
          happy : "happy"
          sad : "sad"
        {{/axis}}

        {{combine mood}}

        {{template}}1girl, {{mood}}{{/template}}
        {{filename}}img_{{mood.key}}{{/filename}}
        """
        prog = parse(src)
        assert prog.axes["mood"].is_optional is True
        
        rendered = render(prog)
        # Combination count should be 3: happy, sad, and omitted
        assert rendered["total"] == 3
        
        # Test exact filenames resolved
        filenames = {item["filename"] for item in rendered["items"]}
        assert filenames == {"img_happy", "img_sad", "img"}

    def test_clean_filename_toggle_on_off(self):
        from prompt_dsl import parse, render
        # Test clean_filename = "false"
        src_false = """
        {{set clean_filename = "false"}}
        {{axis mood?}}
          happy : "happy"
        {{/axis}}
        {{combine mood}}
        {{template}}1girl{{/template}}
        {{filename}}img_{{mood.key}}_tag{{/filename}}
        """
        prog_false = parse(src_false)
        rendered_false = render(prog_false)
        filenames_false = {item["filename"] for item in rendered_false["items"]}
        # When clean_filename = "false", double underscore is preserved
        assert filenames_false == {"img_happy_tag", "img__tag"}

        # Test clean_filename = "true" (default)
        src_true = """
        {{axis mood?}}
          happy : "happy"
        {{/axis}}
        {{combine mood}}
        {{template}}1girl{{/template}}
        {{filename}}img_{{mood.key}}_tag{{/filename}}
        """
        prog_true = parse(src_true)
        rendered_true = render(prog_true)
        filenames_true = {item["filename"] for item in rendered_true["items"]}
        # When clean_filename = "true" (default), double underscore is normalized
        assert filenames_true == {"img_happy_tag", "img_tag"}


