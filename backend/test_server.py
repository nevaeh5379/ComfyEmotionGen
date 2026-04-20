"""
test_server.py
FastAPI 서버 엔드포인트 테스트.
실행: pytest test_server.py -v
"""

import pytest
from fastapi.testclient import TestClient

from server import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_workflow():
    return {
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "{{input}}, masterpiece"},
        },
    }


@pytest.fixture
def mini_template():
    return """
{{axis mood}}
  a : "happy"
  b : "sad"
{{/axis}}

{{combine mood}}

{{template}}1girl, {{mood}}{{/template}}
{{filename}}test_{{mood.key}}{{/filename}}
"""


class TestHealth:
    def test_health_returns_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


class TestRender:
    def test_render_returns_all_combinations(self, client, mini_template):
        r = client.post("/render", json={"template": mini_template})
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2
        assert {item["filename"] for item in data["items"]} == {"test_a", "test_b"}

    def test_render_syntax_error_returns_400(self, client):
        r = client.post("/render", json={"template": "{{axis broken"})
        assert r.status_code == 400
        assert r.json()["error"] == "DSLSyntaxError"


class TestInject:
    def test_inject_single_string(self, client, mock_workflow):
        r = client.post("/workflow/inject", json={
            "workflow": mock_workflow,
            "prompt": "1girl, smiling",
        })
        assert r.status_code == 200
        wf = r.json()["workflow"]
        assert wf["6"]["inputs"]["text"] == "1girl, smiling, masterpiece"

    def test_inject_mapping(self, client):
        wf = {"n": {"inputs": {"text": "{{pos}} / {{neg}}"}}}
        r = client.post("/workflow/inject", json={
            "workflow": wf,
            "prompt": {"{{pos}}": "good", "{{neg}}": "bad"},
        })
        assert r.status_code == 200
        assert r.json()["workflow"]["n"]["inputs"]["text"] == "good / bad"


class TestCORS:
    def test_cors_headers_present(self, client):
        r = client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert r.headers.get("access-control-allow-origin") == "*"
