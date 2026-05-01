"""
test_seed_helper.py
워크플로우 시드 갱신 헬퍼 단위 테스트.
실행: pytest test_seed_helper.py -v
"""

from __future__ import annotations

from jobs import _clone_workflow_with_new_seed


def _wf():
    return {
        "1": {
            "class_type": "KSampler",
            "inputs": {"seed": 42, "steps": 20, "cfg": 7.5},
        },
        "2": {
            "class_type": "KSamplerAdvanced",
            "inputs": {"noise_seed": 100, "add_noise": "enable"},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "1girl"},
        },
    }


def test_random_strategy_changes_all_seeds():
    wf = _wf()
    cloned = _clone_workflow_with_new_seed(wf, strategy="random", increment_offset=1)
    # 원본 보존
    assert wf["1"]["inputs"]["seed"] == 42
    assert wf["2"]["inputs"]["noise_seed"] == 100
    # 갱신
    assert cloned["1"]["inputs"]["seed"] != 42 or cloned["2"]["inputs"]["noise_seed"] != 100
    # seed/noise_seed 외 필드는 보존
    assert cloned["1"]["inputs"]["steps"] == 20
    assert cloned["3"]["inputs"]["text"] == "1girl"


def test_increment_strategy_adds_offset():
    wf = _wf()
    cloned = _clone_workflow_with_new_seed(wf, strategy="increment", increment_offset=3)
    assert cloned["1"]["inputs"]["seed"] == 45
    assert cloned["2"]["inputs"]["noise_seed"] == 103


def test_increment_falls_back_to_random_when_not_int():
    wf = {"1": {"class_type": "X", "inputs": {"seed": "0"}}}
    cloned = _clone_workflow_with_new_seed(wf, strategy="increment", increment_offset=1)
    # 문자열 시드면 random으로 대체
    assert isinstance(cloned["1"]["inputs"]["seed"], int)


def test_no_seed_nodes_unchanged():
    wf = {"1": {"class_type": "CLIPTextEncode", "inputs": {"text": "hi"}}}
    cloned = _clone_workflow_with_new_seed(wf, strategy="random", increment_offset=1)
    assert cloned == wf
