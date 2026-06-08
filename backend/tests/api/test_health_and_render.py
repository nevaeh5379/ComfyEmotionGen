"""
Tests for:
  GET  /health
  GET  /version
  POST /render
  POST /workflow/inject
  GET  /templates
"""
from __future__ import annotations


# ──────────────────────────────────────────────────────────────────
#  DSL templates — correct CEG grammar
# ──────────────────────────────────────────────────────────────────

SIMPLE_TEMPLATE = (
    '{{axis mood}}\n'
    '  happy : "a happy scene"\n'
    '  sad : "a sad scene"\n'
    '  angry : "an angry scene"\n'
    '{{/axis}}\n'
    '{{combine mood}}\n'
    '{{template}}A person feeling {{mood}}.{{/template}}\n'
    '{{filename}}{{mood}}{{/filename}}\n'
)

COMBINED_TEMPLATE = (
    '{{axis mood}}\n'
    '  happy : "happy"\n'
    '  sad : "sad"\n'
    '{{/axis}}\n'
    '{{axis style}}\n'
    '  photo : "photo"\n'
    '  painting : "painting"\n'
    '{{/axis}}\n'
    '{{combine mood * style}}\n'
    '{{template}}{{mood}} in {{style}} style.{{/template}}\n'
    '{{filename}}{{mood}}_{{style}}{{/filename}}\n'
)


# ── health ────────────────────────────────────────────────────────

def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["backend"] == "ok"
    assert "workers" in data
    assert isinstance(data["workers"], list)


# ── version ────────────────────────────────────────────────────────

def test_version_returns_fields(client):
    resp = client.get("/version")
    assert resp.status_code == 200
    data = resp.json()
    assert "backend" in data
    assert "bundle" in data
    assert "commit" in data


# ── render ─────────────────────────────────────────────────────────

def test_render_simple(client):
    resp = client.post("/render", json={"template": SIMPLE_TEMPLATE})
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 3
    assert len(data["items"]) == 3
    for item in data["items"]:
        assert "prompt" in item
        assert "filename" in item
        assert "meta" in item


def test_render_combined_axes(client):
    resp = client.post("/render", json={"template": COMBINED_TEMPLATE})
    assert resp.status_code == 200
    data = resp.json()
    # 2 moods × 2 styles = 4
    assert data["count"] == 4
    assert len(data["items"]) == 4
    assert "mood" in data["axes"]
    assert "style" in data["axes"]


def test_render_only_filter(client):
    resp = client.post(
        "/render",
        json={
            "template": COMBINED_TEMPLATE,
            "only": {"mood": ["happy"]},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # only happy × 2 styles = 2
    assert data["count"] == 2


def test_render_fix_filter(client):
    resp = client.post(
        "/render",
        json={
            "template": COMBINED_TEMPLATE,
            "fix": {"mood": "happy"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2


def test_render_limit(client):
    resp = client.post(
        "/render",
        json={
            "template": SIMPLE_TEMPLATE,
            "limit": 2,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # count = total (before limit), items sliced to limit
    assert data["count"] == 3  # total remains 3
    assert len(data["items"]) == 2  # but only 2 items returned


def test_render_syntax_error_returns_400(client):
    resp = client.post("/render", json={"template": "{{axis}}"})
    assert resp.status_code == 400
    data = resp.json()
    assert data["error"] == "DSLSyntaxError"


def test_render_template_without_combine(client):
    """A template with no {{combine}} block should still render."""
    minimal = "{{template}}hello world{{/template}}"
    resp = client.post("/render", json={"template": minimal})
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert len(data["items"]) == 1


# ── workflow/inject ────────────────────────────────────────────────

def test_inject_string_prompt(client):
    workflow = {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "prompt": "{{input}}",
            },
        },
    }
    resp = client.post(
        "/workflow/inject",
        json={
            "workflow": workflow,
            "prompt": "a cat sitting on a mat",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "workflow" in data
    assert data["workflow"]["3"]["inputs"]["prompt"] == "a cat sitting on a mat"


def test_inject_dict_prompt(client):
    workflow = {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "positive": "{{input}}",
                "negative": "{{neg}}",
            },
        },
    }
    resp = client.post(
        "/workflow/inject",
        json={
            "workflow": workflow,
            "prompt": {
                "{{input}}": "beautiful landscape",
                "{{neg}}": "blurry, bad",
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    wf = data["workflow"]
    assert wf["3"]["inputs"]["positive"] == "beautiful landscape"
    assert wf["3"]["inputs"]["negative"] == "blurry, bad"


def test_inject_custom_placeholder(client):
    workflow = {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "prompt": "[[PROMPT]]",
            },
        },
    }
    resp = client.post(
        "/workflow/inject",
        json={
            "workflow": workflow,
            "prompt": "a dog running",
            "placeholder": "[[PROMPT]]",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["workflow"]["3"]["inputs"]["prompt"] == "a dog running"


def test_inject_no_placeholder_match_returns_original(client):
    workflow = {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "prompt": "static text",
            },
        },
    }
    resp = client.post(
        "/workflow/inject",
        json={
            "workflow": workflow,
            "prompt": "this won't match anything",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["workflow"]["3"]["inputs"]["prompt"] == "static text"


# ── templates ──────────────────────────────────────────────────────

def test_list_templates_returns_list(client):
    resp = client.get("/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)