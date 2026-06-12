from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.src.job_store import JobStore
from backend.src.jobs import JobManager, Job
from backend.src.worker_pool import WorkerPool
from backend.src.worker import BaseWorker


def _make_job_dict(
    *,
    id: str,
    status: str = "pending",
    worker_id: str | None = None,
) -> dict:
    return {
        "id": id,
        "filename": f"{id}.png",
        "prompt": "prompt text",
        "_workflow": {"1": {"class_type": "KSampler"}},
        "status": status,
        "workerId": worker_id,
        "error": None,
        "imageUrls": [],
        "progressPercent": 0.0,
        "currentNodeName": "",
        "createdAt": time.time(),
        "startedAt": None,
        "finishedAt": None,
        "retryCount": 0,
        "executionDurationMs": None,
        "meta": {},
        "cegTemplate": "",
        "savedImageHashes": [],
        "totalNodeCount": 0,
        "completedNodeCount": 0,
        "workerType": "comfyui",
        "targetWorkerId": None,
    }


class TestBatchCancel:
    @pytest.mark.asyncio
    async def test_job_store_cancel_batch(self, tmp_store: JobStore) -> None:
        # 1. Seed database with active and inactive jobs
        j1 = _make_job_dict(id="job-1", status="pending")
        j2 = _make_job_dict(id="job-2", status="running", worker_id="w-1")
        j3 = _make_job_dict(id="job-3", status="done")
        
        await tmp_store.save(j1)
        await tmp_store.save(j2)
        await tmp_store.save(j3)

        # 2. Call cancel_batch
        now = time.time()
        updates = [
            {"id": "job-1", "finished_at": now, "worker_id": None},
            {"id": "job-2", "finished_at": now, "worker_id": "w-1"},
        ]
        await tmp_store.cancel_batch(updates)

        # 3. Verify database updates
        loaded = {item["id"]: item for item in await tmp_store.load_all()}
        
        assert loaded["job-1"]["status"] == "cancelled"
        assert loaded["job-1"]["finishedAt"] == pytest.approx(now)
        
        assert loaded["job-2"]["status"] == "cancelled"
        assert loaded["job-2"]["finishedAt"] == pytest.approx(now)
        
        assert loaded["job-3"]["status"] == "done"  # Unaffected

        # Verify events
        events = await tmp_store.get_job_events("job-1")
        assert len(events) >= 1
        assert any(e["eventType"] == "cancelled" for e in events)

    @pytest.mark.asyncio
    async def test_job_manager_cancel_all(self, tmp_store: JobStore, tmp_path) -> None:
        # Mock WorkerPool and Workers
        mock_pool = MagicMock(spec=WorkerPool)
        
        worker1 = MagicMock(spec=BaseWorker)
        worker1.id = "worker-1"
        worker1.alive = True
        worker1.busy = True
        worker1.current_job_id = "job-running"
        worker1.info = MagicMock(return_value=MagicMock())
        worker1.interrupt = AsyncMock()
        worker1.delete_from_queue = AsyncMock()
        worker1.clear_queue = AsyncMock()

        mock_pool.get.side_effect = lambda wid: worker1 if wid == "worker-1" else None
        mock_pool.all.return_value = [worker1]

        # Initialize JobManager
        manager = JobManager(pool=mock_pool, store=tmp_store, images_dir=tmp_path / "images")
        await manager.start()

        # Seed in-memory and DB jobs
        # 1. Running job
        j_run = _make_job_dict(id="job-running", status="running", worker_id="worker-1")
        # 2. Pending job
        j_pen = _make_job_dict(id="job-pending", status="pending")
        # 3. Already finished job
        j_done = _make_job_dict(id="job-done", status="done")

        # Save to DB
        await tmp_store.save(j_run)
        await tmp_store.save(j_pen)
        await tmp_store.save(j_done)

        # Instead of reload_jobs (which resets running -> pending), insert active jobs directly into memory
        async with manager._lock:
            manager._jobs["job-running"] = Job.from_dict(j_run)
            manager._jobs["job-pending"] = Job.from_dict(j_pen)

        # Verify initial memory state
        assert "job-running" in manager._jobs
        assert "job-pending" in manager._jobs
        assert "job-done" not in manager._jobs

        # Perform cancel_all
        cancelled_count = await manager.cancel_all()
        assert cancelled_count == 2  # running and pending should be cancelled

        # Verify in-memory state: active jobs should be removed from manager._jobs
        assert "job-running" not in manager._jobs
        assert "job-pending" not in manager._jobs

        # Verify DB updates
        db_jobs = {item["id"]: item for item in await tmp_store.load_all()}
        assert db_jobs["job-running"]["status"] == "cancelled"
        assert db_jobs["job-pending"]["status"] == "cancelled"
        assert db_jobs["job-done"]["status"] == "done"

        # Verify worker interactions
        worker1.interrupt.assert_awaited_once()
        worker1.delete_from_queue.assert_awaited_once_with("job-running")
        worker1.clear_queue.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_job_store_delete_batch(self, tmp_store: JobStore) -> None:
        # 1. Seed database
        j1 = _make_job_dict(id="del-1")
        j2 = _make_job_dict(id="del-2")
        j3 = _make_job_dict(id="del-3")
        await tmp_store.save(j1)
        await tmp_store.save(j2)
        await tmp_store.save(j3)

        # 2. Delete batch
        await tmp_store.delete_batch(["del-1", "del-2"])

        # 3. Verify
        loaded = await tmp_store.load_all()
        assert len(loaded) == 1
        assert loaded[0]["id"] == "del-3"

    @pytest.mark.asyncio
    async def test_job_manager_remove_batch(self, tmp_store: JobStore, tmp_path) -> None:
        mock_pool = MagicMock(spec=WorkerPool)
        mock_pool.all.return_value = []

        manager = JobManager(pool=mock_pool, store=tmp_store, images_dir=tmp_path / "images")
        await manager.start()

        j1 = _make_job_dict(id="del-mgr-1")
        j2 = _make_job_dict(id="del-mgr-2")
        await tmp_store.save(j1)
        await tmp_store.save(j2)

        async with manager._lock:
            manager._jobs["del-mgr-1"] = Job.from_dict(j1)

        # Remove batch
        removed = await manager.remove_batch(["del-mgr-1", "del-mgr-2"])
        assert removed == 2

        # Verify memory
        assert "del-mgr-1" not in manager._jobs

        # Verify DB
        loaded = await tmp_store.load_all()
        assert len(loaded) == 0

