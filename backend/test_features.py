

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


@pytest.fixture
def sampling_template():
    return """
{{axis outfit}}
  uniform : "school uniform"
  casual  : "hoodie, jeans"
  dress   : "dress"
  swim    : "bikini"
{{/axis}}

{{axis emotion}}
  happy : "smiling"
  sad   : "teary eyes"
  angry : "angry"
  calm  : "calm"
{{/axis}}

{{axis pose}}
  stand  : "standing"
  sit    : "sitting"
{{/axis}}

{{combine outfit * emotion * pose : sample=5 seed=42}}

{{template}}
1girl, {{outfit}}, {{emotion}}, {{pose}}
{{/template}}

{{filename}}{{outfit.key}}_{{emotion.key}}_{{pose.key}}{{/filename}}
"""


class TestSampling:
    def test_sample_count_matches_request(self, sampling_template):
        """sample=5 옵션이 정확히 5개만 생성하는가."""
        results = render(parse(sampling_template))
        assert len(results) == 5

    def test_sample_is_deterministic_with_seed(self, sampling_template):
        """동일 seed로 두 번 렌더하면 같은 결과가 나오는가."""
        r1 = render(parse(sampling_template))
        r2 = render(parse(sampling_template))
        assert [x["filename"] for x in r1] == [x["filename"] for x in r2]

    def test_sample_results_have_required_fields(self, sampling_template):
        results = render(parse(sampling_template))
        for r in results:
            assert r["filename"]
            assert r["prompt"].startswith("1girl,")
            assert set(r["meta"].keys()) == {"outfit", "emotion", "pose"}


# ====== TEST 2: ComfyUI 워크플로우 주입 ======

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
            "positive_node": {"inputs": {"text": "{{positive}}, {{w:1.1:masterpiece}}"}},
            "negative_node": {"inputs": {"text": "{{negative}}"}},
        }
        injected = inject_into_workflow(wf, {
            "{{positive}}": "1girl, elegant dress, smiling",
            "{{negative}}": "low quality, watermark",
        })

        assert "1girl, elegant dress, smiling" in injected["positive_node"]["inputs"]["text"]
        assert injected["negative_node"]["inputs"]["text"] == "low quality, watermark"

    def test_weight_syntax_is_preserved_as_is(self):
        """inject_into_workflow는 {{w:..:..}} 문법을 건드리지 않아야 한다 (렌더 단계 책임)."""
        wf = {"n": {"inputs": {"text": "{{positive}}, {{w:1.1:masterpiece}}"}}}
        injected = inject_into_workflow(wf, {"{{positive}}": "1girl"})
        assert "{{w:1.1:masterpiece}}" in injected["n"]["inputs"]["text"]


