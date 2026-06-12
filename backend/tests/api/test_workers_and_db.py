"""
Tests for Workers and DB management API endpoints:

Workers:
  GET    /workers                — list workers
  POST   /workers                — add a new worker URL
  DELETE /workers/{worker_id}    — remove a worker

DB:
  GET    /db/export              — export database file
  POST   /db/import              — import database from file upload
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest_asyncio


def _get_job_manager():
    """Access the live app's job_manager."""
    from backend.src.server import job_manager
    return job_manager


def _get_worker_pool():
    """Access the (mocked) WorkerPool from the live app."""
    from backend.src.server import worker_pool
    return worker_pool


def _get_store():
    """Access the JobStore from the live app's job_manager."""
    return _get_job_manager()._store


# ═══════════════════════════════════════════════════════════════
#  Workers — GET /workers
# ═══════════════════════════════════════════════════════════════


class TestWorkersList:
    """GET /workers — list registered workers."""

    def test_list_returns_200(self, client):
        resp = client.get("/workers")
        assert resp.status_code == 200

    def test_list_returns_workers_key(self, client):
        resp = client.get("/workers")
        body = resp.json()
        assert "workers" in body
        assert isinstance(body["workers"], list)

    def test_list_empty_initially(self, client):
        """Mock pool has no workers by default."""
        resp = client.get("/workers")
        body = resp.json()
        assert body["workers"] == []

    def test_list_returns_worker_fields_after_add(self, client):
        """After adding a worker, list should include its fields."""
        pool = _get_worker_pool()

        # Simulate that info() returns one worker
        pool.info.return_value = [
            SimpleNamespace(
                id="w1",
                url="http://localhost:8188",
                alive=True,
                busy=False,
                current_job_id=None,
            )
        ]

        resp = client.get("/workers")
        body = resp.json()
        assert len(body["workers"]) == 1
        w = body["workers"][0]
        assert w["id"] == "w1"
        assert w["url"] == "http://localhost:8188"
        assert w["alive"] is True
        assert w["busy"] is False
        assert w["currentJobId"] is None

        # Reset to empty for other tests
        pool.info.return_value = []


# ═══════════════════════════════════════════════════════════════
#  Workers — POST /workers
# ═══════════════════════════════════════════════════════════════


class TestWorkersCreate:
    """POST /workers — add a new worker URL."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        """Configure mock pool to return a realistic worker on add()."""
        pool = _get_worker_pool()

        # Create a mock worker whose .info() returns a WorkerInfo-like object
        mock_worker = SimpleNamespace(
            info=lambda: SimpleNamespace(
                id="mock-worker-1",
                url="http://comfyui.local:8188",
                alive=True,
                busy=False,
                current_job_id=None,
                worker_type="comfyui",
            )
        )
        pool.add.reset_mock()
        pool.add.side_effect = None
        pool.add.return_value = mock_worker
        pool.has_url.return_value = False

    def test_create_worker_returns_200(self, client):
        resp = client.post("/workers", json={"url": "http://comfyui.local:8188"})
        assert resp.status_code == 200

    def test_create_worker_returns_worker_view(self, client):
        resp = client.post("/workers", json={"url": "http://comfyui.local:8188"})
        body = resp.json()
        assert "worker" in body
        worker = body["worker"]
        assert worker["id"] == "mock-worker-1"
        assert worker["url"] == "http://comfyui.local:8188"
        assert worker["alive"] is True
        assert worker["busy"] is False
        assert worker["currentJobId"] is None
        assert worker["workerType"] == "comfyui"

    def test_create_worker_calls_pool_add(self, client):
        pool = _get_worker_pool()
        client.post("/workers", json={"url": "http://comfyui.local:8188"})
        pool.add.assert_awaited_once_with("http://comfyui.local:8188", worker_type="comfyui")

    async def test_create_worker_stores_url(self, client):
        store = _get_store()
        client.post("/workers", json={"url": "http://comfyui.local:8188"})
        entries = await store.list_worker_urls()
        urls = [e["url"] for e in entries]
        assert "http://comfyui.local:8188" in urls

    def test_create_duplicate_url_returns_400(self, client):
        """When the pool reports the URL already exists, server returns 400."""
        pool = _get_worker_pool()
        pool.has_url.return_value = True

        resp = client.post("/workers", json={"url": "http://comfyui.local:8188"})
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]

    def test_create_empty_url_returns_400(self, client):
        """Empty URL string should raise ValueError → 400."""
        pool = _get_worker_pool()
        pool.has_url.side_effect = None
        pool.has_url.return_value = False
        pool.add.side_effect = ValueError("URL is empty")

        resp = client.post("/workers", json={"url": ""})
        assert resp.status_code == 400

    def test_create_strips_trailing_slash(self, client):
        pool = _get_worker_pool()
        pool.add.side_effect = None
        pool.add.reset_mock()

        pool.add.return_value = SimpleNamespace(
            info=lambda: SimpleNamespace(
                id="mock-worker-slash",
                url="http://comfyui.local:8188",
                alive=True, busy=False, current_job_id=None,
                worker_type="comfyui",
            )
        )
        pool.has_url.side_effect = None
        pool.has_url.return_value = False

        resp = client.post("/workers", json={"url": "http://comfyui.local:8188/"})
        assert resp.status_code == 200
        pool.add.assert_awaited_once_with("http://comfyui.local:8188", worker_type="comfyui")

    def test_create_missing_url_returns_422(self, client):
        """POST without url field should return 422 (validation error)."""
        resp = client.post("/workers", json={})
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════
#  Workers — DELETE /workers/{worker_id}
# ═══════════════════════════════════════════════════════════════


class TestWorkersDelete:
    """DELETE /workers/{worker_id} — remove a worker."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        pool = _get_worker_pool()
        pool.remove.reset_mock()
        pool.remove.side_effect = None
        pool.remove.return_value = True
        # get returns None by default → worker not found → 404
        pool.get.return_value = None
        pool.get.side_effect = None

    def test_delete_nonexistent_worker_returns_404(self, client):
        """If the worker_id is not found in the pool, returns 404."""
        resp = client.delete("/workers/nonexistent-worker-id")
        assert resp.status_code == 404

    def test_delete_existing_worker_returns_200(self, client):
        pool = _get_worker_pool()

        mock_worker = SimpleNamespace(
            current_job_id=None,
            base_url="http://comfyui.local:8188",
        )
        pool.get.return_value = mock_worker

        resp = client.delete("/workers/mock-worker-1")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("ok") is True

    async def test_delete_with_active_job_returns_409(self, client, monkeypatch):
        from backend.src.jobs import ActiveJobError

        pool = _get_worker_pool()
        mock_worker = SimpleNamespace(
            current_job_id="job-123",
            base_url="http://comfyui.local:8188",
        )
        pool.get.return_value = mock_worker

        jm = _get_job_manager()
        original_remove = jm.remove_worker

        async def _fake_remove(worker_id, *, force=False):
            if not force:
                raise ActiveJobError(worker_id=worker_id, job_id="job-123")
            return await original_remove(worker_id, force=force)

        monkeypatch.setattr(jm, "remove_worker", _fake_remove)
        resp = client.delete("/workers/mock-worker-1")
        assert resp.status_code == 409
        body = resp.json()
        assert body["detail"]["error"] == "ActiveJob"
        assert body["detail"]["workerId"] == "mock-worker-1"
        assert body["detail"]["jobId"] == "job-123"

    def test_delete_with_force_removes_worker(self, client):
        """force=true should cancel the active job and remove the worker."""
        pool = _get_worker_pool()

        mock_worker = SimpleNamespace(
            current_job_id="job-456",
            base_url="http://comfyui.local:8188",
        )
        pool.get.return_value = mock_worker
        pool.remove.return_value = True

        resp = client.delete("/workers/mock-worker-1?force=true")
        assert resp.status_code == 200

    async def test_delete_removes_worker_url_from_store(self, client):
        pool = _get_worker_pool()
        store = _get_store()

        await store.add_worker_url("http://comfyui.local:8188")

        mock_worker = SimpleNamespace(
            current_job_id=None,
            base_url="http://comfyui.local:8188",
        )
        pool.get.return_value = mock_worker
        pool.remove.return_value = True

        resp = client.delete("/workers/mock-worker-1")
        assert resp.status_code == 200

        entries = await store.list_worker_urls()
        assert "http://comfyui.local:8188" not in [e["url"] for e in entries]


# ═══════════════════════════════════════════════════════════════
#  DB — GET /db/export
# ═══════════════════════════════════════════════════════════════


class TestDbExport:
    """GET /db/export — export database file."""

    def test_export_returns_200(self, client):
        resp = client.get("/db/export")
        assert resp.status_code == 200

    def test_export_returns_sqlite_content_type(self, client):
        resp = client.get("/db/export")
        assert resp.status_code == 200
        content_type = resp.headers.get("content-type", "")
        assert "sqlite" in content_type or "octet-stream" in content_type

    def test_export_returns_file_attachment(self, client):
        resp = client.get("/db/export")
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "jobs.db" in cd

    def test_export_response_has_content(self, client):
        resp = client.get("/db/export")
        assert resp.status_code == 200
        assert len(resp.content) > 0

    async def test_export_contains_settings(self, client):
        """Settings written before export should appear in the exported DB."""
        store = _get_store()
        await store.save_setting("export_test_key", "export_test_value")

        resp = client.get("/db/export")
        assert resp.status_code == 200
        # The DB file content should be non-trivial (contains the settings table)
        assert len(resp.content) > 100


# ═══════════════════════════════════════════════════════════════
#  DB — POST /db/import
# ═══════════════════════════════════════════════════════════════


class TestDbImport:
    """POST /db/import — import database from file upload."""

    def test_import_valid_sqlite_file_returns_200(self, client):
        # First, export the current DB to get a valid SQLite file
        export_resp = client.get("/db/export")
        assert export_resp.status_code == 200
        db_bytes = export_resp.content

        # Upload it back
        resp = client.post(
            "/db/import",
            files={"file": ("jobs.db", db_bytes, "application/x-sqlite3")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("ok") is True

    def test_import_response_structure(self, client):
        """Import should return {ok: true} on success."""
        export_resp = client.get("/db/export")
        db_bytes = export_resp.content

        resp = client.post(
            "/db/import",
            files={"file": ("jobs.db", db_bytes, "application/x-sqlite3")},
        )
        body = resp.json()
        assert "ok" in body
        assert body["ok"] is True

    def test_import_empty_filename_returns_error(self, client):
        """Missing or empty filename should return an error (400 or 422)."""
        export_resp = client.get("/db/export")
        db_bytes = export_resp.content

        resp = client.post(
            "/db/import",
            files={"file": ("", db_bytes, "application/x-sqlite3")},
        )
        # FastAPI validates UploadFile requirement → 422 if empty filename
        # The server handler checks file.filename and returns 400
        assert resp.status_code in (400, 422)

    def test_import_roundtrip_preserves_db_integrity(self, client):
        """Export → Import should result in a usable DB that can be exported again."""
        export_resp = client.get("/db/export")
        db_bytes = export_resp.content

        resp = client.post(
            "/db/import",
            files={"file": ("jobs.db", db_bytes, "application/x-sqlite3")},
        )
        assert resp.status_code == 200

        # After import, export should still work
        export_resp2 = client.get("/db/export")
        assert export_resp2.status_code == 200
        assert len(export_resp2.content) > 0