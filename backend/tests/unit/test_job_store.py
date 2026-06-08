"""Unit tests for backend.src.job_store."""

from __future__ import annotations

import json
import time
from typing import Any

import pytest

from backend.src.job_store import JobStore, _saved_image_row_to_dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_job(
    *,
    id: str = "job-1",
    filename: str = "test.png",
    prompt: str = "a happy cat",
    status: str = "pending",
    worker_id: str | None = None,
    created_at: float | None = None,
    **overrides: Any,
) -> dict[str, Any]:
    """Return a minimal valid job dict that ``JobStore.save`` accepts."""
    job: dict[str, Any] = {
        "id": id,
        "filename": filename,
        "prompt": prompt,
        "_workflow": {"3": {"class_type": "KSampler"}},
        "status": status,
        "workerId": worker_id,
        "error": None,
        "imageUrls": [],
        "progressPercent": 0.0,
        "currentNodeName": "",
        "createdAt": created_at or time.time(),
        "startedAt": None,
        "finishedAt": None,
        "retryCount": 0,
        "executionDurationMs": None,
        "meta": {},
        "cegTemplate": "",
    }
    job.update(overrides)
    return job


def _make_image(
    *,
    hash: str = "abc123",
    job_id: str = "job-1",
    original_filename: str = "photo.png",
    comfy_filename: str = "ComfyUI_00001_.png",
    subfolder: str = "",
    type_: str = "output",
    worker_id: str | None = "worker-1",
    extension: str = ".png",
    size_bytes: int = 1024,
    prompt: str = "a landscape",
    meta: dict[str, str] | None = None,
    ceg_template: str = "",
    workflow: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return keyword dict suitable for ``save_image_record``."""
    return {
        "hash": hash,
        "job_id": job_id,
        "original_filename": original_filename,
        "comfy_filename": comfy_filename,
        "subfolder": subfolder,
        "type_": type_,
        "worker_id": worker_id,
        "extension": extension,
        "size_bytes": size_bytes,
        "prompt": prompt,
        "meta": meta,
        "ceg_template": ceg_template,
        "workflow": workflow,
    }


# ===================================================================
# Jobs table
# ===================================================================


class TestJobs:
    """Tests for save / load_all / delete / count_jobs / query_jobs."""

    async def test_save_and_load_all(self, tmp_store: JobStore) -> None:
        job = _make_job()
        await tmp_store.save(job)
        loaded = await tmp_store.load_all()
        assert len(loaded) == 1
        assert loaded[0]["id"] == "job-1"
        assert loaded[0]["filename"] == "test.png"
        assert loaded[0]["status"] == "pending"

    async def test_save_upserts(self, tmp_store: JobStore) -> None:
        """Saving the same id again should replace the existing row."""
        await tmp_store.save(_make_job(status="pending"))
        await tmp_store.save(_make_job(status="completed"))
        loaded = await tmp_store.load_all()
        assert len(loaded) == 1
        assert loaded[0]["status"] == "completed"

    async def test_load_all_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.load_all() == []

    async def test_load_all_preserves_json_fields(self, tmp_store: JobStore) -> None:
        job = _make_job(
            imageUrls=["http://img/1.png"],
            _workflow={"5": {"class_type": "CLIPTextEncode"}},
            meta={"seed": 42},
        )
        await tmp_store.save(job)
        loaded = await tmp_store.load_all()
        assert loaded[0]["imageUrls"] == ["http://img/1.png"]
        assert loaded[0]["_workflow"] == {"5": {"class_type": "CLIPTextEncode"}}
        assert loaded[0]["meta"] == {"seed": 42}

    async def test_delete(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1"))
        await tmp_store.save(_make_job(id="j2"))
        await tmp_store.delete("j1")
        loaded = await tmp_store.load_all()
        assert len(loaded) == 1
        assert loaded[0]["id"] == "j2"

    async def test_delete_nonexistent(self, tmp_store: JobStore) -> None:
        """Deleting a missing id should not raise."""
        await tmp_store.delete("ghost")

    async def test_count_jobs_no_filter(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1"))
        await tmp_store.save(_make_job(id="j2"))
        assert await tmp_store.count_jobs() == 2

    async def test_count_jobs_by_status(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1", status="pending"))
        await tmp_store.save(_make_job(id="j2", status="completed"))
        await tmp_store.save(_make_job(id="j3", status="completed"))
        assert await tmp_store.count_jobs(status="completed") == 2
        assert await tmp_store.count_jobs(status="pending") == 1

    async def test_count_jobs_by_filename(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1", filename="cat_photo.png"))
        await tmp_store.save(_make_job(id="j2", filename="dog_photo.png"))
        await tmp_store.save(_make_job(id="j3", filename="landscape.jpg"))
        # filename uses LIKE with wildcards
        assert await tmp_store.count_jobs(filename="photo") == 2

    async def test_count_jobs_combined_filters(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1", filename="cat_photo.png", status="completed"))
        await tmp_store.save(_make_job(id="j2", filename="dog_photo.png", status="pending"))
        assert await tmp_store.count_jobs(status="completed", filename="photo") == 1

    async def test_query_jobs_default_params(self, tmp_store: JobStore) -> None:
        for i in range(5):
            await tmp_store.save(_make_job(id=f"j{i}"))
        result = await tmp_store.query_jobs()
        assert len(result) == 5

    async def test_query_jobs_limit_offset(self, tmp_store: JobStore) -> None:
        for i in range(5):
            await tmp_store.save(_make_job(id=f"j{i}"))
        page1 = await tmp_store.query_jobs(limit=2, offset=0)
        page2 = await tmp_store.query_jobs(limit=2, offset=2)
        assert len(page1) == 2
        assert len(page2) == 2
        # No overlap
        ids1 = {r["id"] for r in page1}
        ids2 = {r["id"] for r in page2}
        assert ids1.isdisjoint(ids2)

    async def test_query_jobs_status_filter(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1", status="pending"))
        await tmp_store.save(_make_job(id="j2", status="completed"))
        result = await tmp_store.query_jobs(status="completed")
        assert len(result) == 1
        assert result[0]["id"] == "j2"

    async def test_query_jobs_filename_filter(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1", filename="cat.png"))
        await tmp_store.save(_make_job(id="j2", filename="dog.png"))
        result = await tmp_store.query_jobs(filename="cat")
        assert len(result) == 1

    async def test_query_jobs_combined_filters(self, tmp_store: JobStore) -> None:
        await tmp_store.save(_make_job(id="j1", filename="cat.png", status="pending"))
        await tmp_store.save(_make_job(id="j2", filename="cat.png", status="completed"))
        result = await tmp_store.query_jobs(status="pending", filename="cat")
        assert len(result) == 1 and result[0]["id"] == "j1"


# ===================================================================
# Job events
# ===================================================================


class TestJobEvents:
    """Tests for save_event / get_job_events."""

    async def test_save_and_get_events(self, tmp_store: JobStore) -> None:
        await tmp_store.save_event("j1", "created")
        await tmp_store.save_event("j1", "started", worker_id="w1")
        events = await tmp_store.get_job_events("j1")
        assert len(events) == 2
        assert events[0]["eventType"] == "created"
        assert events[0]["workerId"] is None
        assert events[1]["eventType"] == "started"
        assert events[1]["workerId"] == "w1"

    async def test_save_event_with_details(self, tmp_store: JobStore) -> None:
        await tmp_store.save_event("j1", "error", details={"msg": "timeout"})
        events = await tmp_store.get_job_events("j1")
        assert len(events) == 1
        assert events[0]["details"] == {"msg": "timeout"}

    async def test_get_job_events_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.get_job_events("nonexistent") == []

    async def test_events_ordered_by_timestamp(self, tmp_store: JobStore) -> None:
        """Events should come back in chronological order."""
        await tmp_store.save_event("j1", "first")
        await tmp_store.save_event("j1", "second")
        events = await tmp_store.get_job_events("j1")
        assert events[0]["eventType"] == "first"
        assert events[1]["eventType"] == "second"


# ===================================================================
# Execution events
# ===================================================================


class TestExecutionEvents:
    """Tests for save_execution_event / get_execution_events."""

    async def test_save_and_get_execution_events(self, tmp_store: JobStore) -> None:
        payload = {"node": "KSampler", "value": 42}
        await tmp_store.save_execution_event("j1", "w1", "progress", payload)
        events = await tmp_store.get_execution_events("j1")
        assert len(events) == 1
        assert events[0]["jobId"] == "j1"
        assert events[0]["workerId"] == "w1"
        assert events[0]["eventType"] == "progress"
        assert events[0]["details"] == payload

    async def test_get_execution_events_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.get_execution_events("nonexistent") == []

    async def test_multiple_execution_events(self, tmp_store: JobStore) -> None:
        for i in range(3):
            await tmp_store.save_execution_event("j1", "w1", f"event_{i}", {"i": i})
        events = await tmp_store.get_execution_events("j1")
        assert len(events) == 3


# ===================================================================
# Settings
# ===================================================================


class TestSettings:
    """Tests for save_setting / get_setting / delete_setting / list_settings."""

    async def test_save_and_get_setting(self, tmp_store: JobStore) -> None:
        await tmp_store.save_setting("theme", "dark")
        assert await tmp_store.get_setting("theme") == "dark"

    async def test_get_setting_nonexistent(self, tmp_store: JobStore) -> None:
        assert await tmp_store.get_setting("missing") is None

    async def test_save_setting_upserts(self, tmp_store: JobStore) -> None:
        await tmp_store.save_setting("theme", "dark")
        await tmp_store.save_setting("theme", "light")
        assert await tmp_store.get_setting("theme") == "light"

    async def test_delete_setting(self, tmp_store: JobStore) -> None:
        await tmp_store.save_setting("theme", "dark")
        assert await tmp_store.delete_setting("theme") is True
        assert await tmp_store.get_setting("theme") is None

    async def test_delete_setting_nonexistent(self, tmp_store: JobStore) -> None:
        assert await tmp_store.delete_setting("nope") is False

    async def test_list_settings(self, tmp_store: JobStore) -> None:
        await tmp_store.save_setting("a", "1")
        await tmp_store.save_setting("b", "2")
        result = await tmp_store.list_settings()
        assert result == {"a": "1", "b": "2"}

    async def test_list_settings_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.list_settings() == {}


# ===================================================================
# Worker URLs
# ===================================================================


class TestWorkerUrls:
    """Tests for add_worker_url / remove_worker_url / list_worker_urls."""

    async def test_add_and_list(self, tmp_store: JobStore) -> None:
        assert await tmp_store.add_worker_url("http://w1:8188") is True
        assert await tmp_store.add_worker_url("http://w2:8188") is True
        entries = await tmp_store.list_worker_urls()
        assert [e["url"] for e in entries] == ["http://w1:8188", "http://w2:8188"]
        assert all(e["worker_type"] == "comfyui" for e in entries)

    async def test_add_duplicate(self, tmp_store: JobStore) -> None:
        assert await tmp_store.add_worker_url("http://w1:8188") is True
        assert await tmp_store.add_worker_url("http://w1:8188") is False

    async def test_remove_worker_url(self, tmp_store: JobStore) -> None:
        await tmp_store.add_worker_url("http://w1:8188")
        assert await tmp_store.remove_worker_url("http://w1:8188") is True
        assert await tmp_store.list_worker_urls() == []

    async def test_remove_nonexistent(self, tmp_store: JobStore) -> None:
        assert await tmp_store.remove_worker_url("http://ghost:8188") is False

    async def test_list_worker_urls_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.list_worker_urls() == []

    async def test_order_preserved(self, tmp_store: JobStore) -> None:
        await tmp_store.add_worker_url("http://c:8188")
        await tmp_store.add_worker_url("http://a:8188")
        await tmp_store.add_worker_url("http://b:8188")
        entries = await tmp_store.list_worker_urls()
        assert [e["url"] for e in entries] == ["http://c:8188", "http://a:8188", "http://b:8188"]

    async def test_worker_type_stored(self, tmp_store: JobStore) -> None:
        await tmp_store.add_worker_url("http://nai:8188", worker_type="nai")
        await tmp_store.add_worker_url("http://comfy:8188", worker_type="comfyui")
        entries = await tmp_store.list_worker_urls()
        by_url = {e["url"]: e["worker_type"] for e in entries}
        assert by_url["http://nai:8188"] == "nai"
        assert by_url["http://comfy:8188"] == "comfyui"


# ===================================================================
# Saved images
# ===================================================================


class TestSavedImages:
    """Tests for save_image_record / get_saved_image / count_saved_images / list_saved_images."""

    async def test_save_and_get_image(self, tmp_store: JobStore) -> None:
        img = _make_image()
        await tmp_store.save_image_record(**img)
        result = await tmp_store.get_saved_image("abc123")
        assert result is not None
        assert result["hash"] == "abc123"
        assert result["jobId"] == "job-1"
        assert result["originalFilename"] == "photo.png"
        assert result["status"] == "pending"
        assert result["note"] == ""

    async def test_get_saved_image_nonexistent(self, tmp_store: JobStore) -> None:
        assert await tmp_store.get_saved_image("nope") is None

    async def test_save_image_record_with_meta_and_workflow(
        self, tmp_store: JobStore
    ) -> None:
        img = _make_image(meta={"seed": "42"}, workflow={"3": {"class_type": "KSampler"}})
        await tmp_store.save_image_record(**img)
        result = await tmp_store.get_saved_image("abc123")
        assert result["meta"] == {"seed": "42"}
        assert result["workflow"] == {"3": {"class_type": "KSampler"}}

    async def test_save_image_duplicate_hash_is_ignored(
        self, tmp_store: JobStore
    ) -> None:
        """INSERT OR IGNORE means a second save with same hash does nothing."""
        await tmp_store.save_image_record(**_make_image())
        await tmp_store.save_image_record(**_make_image(prompt="updated"))
        result = await tmp_store.get_saved_image("abc123")
        assert result["prompt"] == "a landscape"  # unchanged

    async def test_count_saved_images_no_filter(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        await tmp_store.save_image_record(**_make_image(hash="h2"))
        assert await tmp_store.count_saved_images() == 2

    async def test_count_saved_images_by_job_id(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1", job_id="j1"))
        await tmp_store.save_image_record(**_make_image(hash="h2", job_id="j2"))
        assert await tmp_store.count_saved_images(job_id="j1") == 1

    async def test_count_saved_images_by_status(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        # Default status is 'pending'
        assert await tmp_store.count_saved_images(status="pending") == 1
        assert await tmp_store.count_saved_images(status="approved") == 0

    async def test_count_saved_images_by_filename(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(
            **_make_image(hash="h1", original_filename="cat.png")
        )
        await tmp_store.save_image_record(
            **_make_image(hash="h2", original_filename="dog.png")
        )
        assert await tmp_store.count_saved_images(filename="cat.png") == 1

    async def test_count_saved_images_by_tag(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        await tmp_store.save_image_record(**_make_image(hash="h2"))
        await tmp_store.add_tags("h1", ["portrait"])
        assert await tmp_store.count_saved_images(tag="portrait") == 1

    async def test_list_saved_images(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        await tmp_store.save_image_record(**_make_image(hash="h2"))
        result = await tmp_store.list_saved_images()
        assert len(result) == 2

    async def test_list_saved_images_limit_offset(self, tmp_store: JobStore) -> None:
        for i in range(5):
            await tmp_store.save_image_record(**_make_image(hash=f"h{i}"))
        page = await tmp_store.list_saved_images(limit=2, offset=0)
        assert len(page) == 2

    async def test_list_saved_images_with_tag(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        await tmp_store.save_image_record(**_make_image(hash="h2"))
        await tmp_store.add_tags("h1", ["portrait"])
        result = await tmp_store.list_saved_images(tag="portrait")
        assert len(result) == 1
        assert result[0]["hash"] == "h1"

    async def test_list_saved_images_with_status_filter(
        self, tmp_store: JobStore
    ) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        result = await tmp_store.list_saved_images(status="pending")
        assert len(result) == 1

    async def test_list_saved_images_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.list_saved_images() == []


# ===================================================================
# Curation
# ===================================================================


class TestCuration:
    """Tests for update_curation / delete_saved_image / list_trashed_for_purge."""

    async def test_update_curation_status(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.update_curation("abc123", status="approved")
        assert result is not None
        assert result["status"] == "approved"
        assert result["trashedAt"] is None  # not trashed

    async def test_update_curation_to_trashed_sets_trashed_at(
        self, tmp_store: JobStore
    ) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.update_curation("abc123", status="trashed")
        assert result is not None
        assert result["status"] == "trashed"
        assert result["trashedAt"] is not None

    async def test_update_curation_note(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.update_curation("abc123", note="great shot")
        assert result["note"] == "great shot"

    async def test_update_curation_nonexistent(self, tmp_store: JobStore) -> None:
        result = await tmp_store.update_curation("ghost", status="approved")
        assert result is None

    async def test_update_curation_no_args_returns_existing(self, tmp_store: JobStore) -> None:
        """Passing no status/note should return the record unchanged."""
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.update_curation("abc123")
        assert result is not None
        assert result["status"] == "pending"

    async def test_update_curation_untrash_clears_trashed_at(
        self, tmp_store: JobStore
    ) -> None:
        await tmp_store.save_image_record(**_make_image())
        await tmp_store.update_curation("abc123", status="trashed")
        result = await tmp_store.update_curation("abc123", status="approved")
        assert result["trashedAt"] is None

    async def test_delete_saved_image(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        assert await tmp_store.delete_saved_image("abc123") is True
        assert await tmp_store.get_saved_image("abc123") is None

    async def test_delete_saved_image_nonexistent(self, tmp_store: JobStore) -> None:
        assert await tmp_store.delete_saved_image("ghost") is False

    async def test_delete_saved_image_removes_tags(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        await tmp_store.add_tags("abc123", ["cat", "landscape"])
        await tmp_store.delete_saved_image("abc123")
        # Verify tags are gone
        assert await tmp_store.get_tags("abc123") == []

    async def test_list_trashed_for_purge(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1", extension=".png"))
        await tmp_store.save_image_record(**_make_image(hash="h2", extension=".jpg"))
        await tmp_store.update_curation("h1", status="trashed")
        await tmp_store.update_curation("h2", status="trashed")
        trashed = await tmp_store.list_trashed_for_purge()
        assert len(trashed) == 2
        hashes = {t["hash"] for t in trashed}
        assert "h1" in hashes
        assert "h2" in hashes

    async def test_list_trashed_for_purge_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.list_trashed_for_purge() == []


# ===================================================================
# Tags
# ===================================================================


class TestTags:
    """Tests for add_tags / remove_tag / get_tags / list_tag_counts."""

    async def test_add_and_get_tags(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.add_tags("abc123", ["cat", "landscape"])
        assert sorted(result) == ["cat", "landscape"]

    async def test_add_tags_ignores_empty(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.add_tags("abc123", ["cat", "", "  "])
        assert result == ["cat"]

    async def test_add_tags_strips_whitespace(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.add_tags("abc123", ["  cat  "])
        assert result == ["cat"]

    async def test_add_tags_idempotent(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        await tmp_store.add_tags("abc123", ["cat"])
        await tmp_store.add_tags("abc123", ["cat"])
        tags = await tmp_store.get_tags("abc123")
        assert tags == ["cat"]  # no duplicates

    async def test_remove_tag(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        await tmp_store.add_tags("abc123", ["cat", "landscape"])
        result = await tmp_store.remove_tag("abc123", "cat")
        assert result == ["landscape"]

    async def test_remove_tag_nonexistent(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        result = await tmp_store.remove_tag("abc123", "nope")
        assert result == []

    async def test_get_tags_empty(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image())
        assert await tmp_store.get_tags("abc123") == []

    async def test_list_tag_counts(self, tmp_store: JobStore) -> None:
        await tmp_store.save_image_record(**_make_image(hash="h1"))
        await tmp_store.save_image_record(**_make_image(hash="h2"))
        await tmp_store.save_image_record(**_make_image(hash="h3"))
        await tmp_store.add_tags("h1", ["cat", "landscape"])
        await tmp_store.add_tags("h2", ["cat"])
        await tmp_store.add_tags("h3", ["landscape"])
        counts = await tmp_store.list_tag_counts()
        # cat: 2, landscape: 2 — order by count DESC
        by_tag = {c["tag"]: c["count"] for c in counts}
        assert by_tag["cat"] == 2
        assert by_tag["landscape"] == 2

    async def test_list_tag_counts_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.list_tag_counts() == []


# ===================================================================
# Asset groups
# ===================================================================


class TestAssetGroups:
    """Tests for list_asset_groups."""

    async def _seed_images(self, store: JobStore) -> None:
        """Insert sample images belonging to two filename groups."""
        await store.save_image_record(
            **_make_image(hash="h1", original_filename="cat.png")
        )
        await store.save_image_record(
            **_make_image(hash="h2", original_filename="cat.png")
        )
        await store.save_image_record(
            **_make_image(hash="h3", original_filename="dog.png")
        )

    async def test_list_asset_groups_default_sort(self, tmp_store: JobStore) -> None:
        await self._seed_images(tmp_store)
        groups = await tmp_store.list_asset_groups()
        filenames = [g["filename"] for g in groups]
        assert "cat.png" in filenames
        assert "dog.png" in filenames

    async def test_list_asset_groups_by_name(self, tmp_store: JobStore) -> None:
        await self._seed_images(tmp_store)
        groups = await tmp_store.list_asset_groups(sort="name")
        assert groups[0]["filename"] == "cat.png"

    async def test_list_asset_groups_by_count(self, tmp_store: JobStore) -> None:
        await self._seed_images(tmp_store)
        groups = await tmp_store.list_asset_groups(sort="count")
        # cat.png has 2 images, dog.png has 1
        assert groups[0]["filename"] == "cat.png"
        assert groups[0]["total"] == 2

    async def test_list_asset_groups_status_counts(self, tmp_store: JobStore) -> None:
        await self._seed_images(tmp_store)
        await tmp_store.update_curation("h1", status="approved")
        groups = await tmp_store.list_asset_groups()
        cat_group = next(g for g in groups if g["filename"] == "cat.png")
        assert cat_group["approvedCount"] == 1
        assert cat_group["pendingCount"] == 1

    async def test_list_asset_groups_pagination(self, tmp_store: JobStore) -> None:
        await self._seed_images(tmp_store)
        page = await tmp_store.list_asset_groups(limit=1, offset=0)
        assert len(page) == 1

    async def test_list_asset_groups_empty(self, tmp_store: JobStore) -> None:
        assert await tmp_store.list_asset_groups() == []


# ===================================================================
# All events (combined log)
# ===================================================================


class TestAllEvents:
    """Tests for get_all_events."""

    async def test_get_all_events_no_filter(self, tmp_store: JobStore) -> None:
        await tmp_store.save_event("j1", "created")
        await tmp_store.save_event("j2", "created", worker_id="w1")
        events = await tmp_store.get_all_events()
        assert len(events) == 2

    async def test_get_all_events_by_worker_id(self, tmp_store: JobStore) -> None:
        await tmp_store.save_event("j1", "created")
        await tmp_store.save_event("j2", "created", worker_id="w1")
        events = await tmp_store.get_all_events(worker_id="w1")
        assert len(events) == 1
        assert events[0]["workerId"] == "w1"

    async def test_get_all_events_by_status(self, tmp_store: JobStore) -> None:
        """Filtering by status requires a JOIN on the jobs table."""
        await tmp_store.save(_make_job(id="j1", status="pending"))
        await tmp_store.save(_make_job(id="j2", status="completed"))
        await tmp_store.save_event("j1", "created")
        await tmp_store.save_event("j2", "created")
        events = await tmp_store.get_all_events(status="pending")
        assert len(events) == 1
        assert events[0]["jobId"] == "j1"

    async def test_get_all_events_by_status_and_worker(
        self, tmp_store: JobStore
    ) -> None:
        await tmp_store.save(_make_job(id="j1", status="pending"))
        await tmp_store.save(_make_job(id="j2", status="pending"))
        await tmp_store.save_event("j1", "created", worker_id="w1")
        await tmp_store.save_event("j2", "created", worker_id="w2")
        events = await tmp_store.get_all_events(status="pending", worker_id="w1")
        assert len(events) == 1

    async def test_get_all_events_pagination(self, tmp_store: JobStore) -> None:
        await tmp_store.save_event("j1", "ev1")
        await tmp_store.save_event("j1", "ev2")
        await tmp_store.save_event("j1", "ev3")
        page = await tmp_store.get_all_events(limit=2, offset=0)
        assert len(page) == 2


# ===================================================================
# _saved_image_row_to_dict helper
# ===================================================================


class TestSavedImageRowToDict:
    """Tests for the module-level _saved_image_row_to_dict function."""

    def _make_row(self, **overrides: Any) -> dict[str, Any]:
        """Build a minimal row-like dict (simulates aiosqlite.Row)."""
        row: dict[str, Any] = {
            "hash": "h1",
            "job_id": "j1",
            "original_filename": "photo.png",
            "comfy_filename": "ComfyUI_00001_.png",
            "subfolder": "",
            "type": "output",
            "worker_id": "w1",
            "extension": ".png",
            "size_bytes": 1024,
            "prompt": "a cat",
            "created_at": 1000.0,
            "status": "pending",
            "note": "",
            "trashed_at": None,
            "meta_json": "{}",
            "ceg_template": "",
            "workflow_json": "{}",
        }
        row.update(overrides)
        return row

    def test_complete_row(self) -> None:
        row = self._make_row()
        result = _saved_image_row_to_dict(row)
        assert result["hash"] == "h1"
        assert result["jobId"] == "j1"
        assert result["originalFilename"] == "photo.png"
        assert result["status"] == "pending"
        assert result["note"] == ""
        assert result["tags"] == []
        assert result["meta"] == {}
        assert result["workflow"] == {}

    def test_row_with_tags(self) -> None:
        row = self._make_row()
        result = _saved_image_row_to_dict(row, tags=["cat", "landscape"])
        assert result["tags"] == ["cat", "landscape"]

    def test_row_with_meta_json(self) -> None:
        row = self._make_row(meta_json=json.dumps({"seed": 42}))
        result = _saved_image_row_to_dict(row)
        assert result["meta"] == {"seed": 42}

    def test_row_with_invalid_meta_json(self) -> None:
        row = self._make_row(meta_json="not-json")
        result = _saved_image_row_to_dict(row)
        assert result["meta"] == {}  # graceful fallback

    def test_row_with_workflow_json(self) -> None:
        wf = {"3": {"class_type": "KSampler"}}
        row = self._make_row(workflow_json=json.dumps(wf))
        result = _saved_image_row_to_dict(row)
        assert result["workflow"] == wf

    def test_row_with_invalid_workflow_json(self) -> None:
        row = self._make_row(workflow_json="bad-json")
        result = _saved_image_row_to_dict(row)
        assert result["workflow"] == {}

    def test_row_missing_optional_columns(self) -> None:
        """Columns like 'status', 'note', 'trashed_at' may not exist pre-migration."""
        row = {
            "hash": "h1",
            "job_id": "j1",
            "original_filename": "photo.png",
            "comfy_filename": "img.png",
            "subfolder": "",
            "type": "output",
            "worker_id": "w1",
            "extension": ".png",
            "size_bytes": 1024,
            "prompt": "cat",
            "created_at": 1000.0,
            "meta_json": "{}",
            "ceg_template": "",
            "workflow_json": "{}",
        }
        # Simulate a row without keys that normally have defaults
        # by passing an object that doesn't have them in .keys()
        result = _saved_image_row_to_dict(row)
        assert result["status"] == "pending"  # default
        assert result["note"] == ""  # default
        assert result["trashedAt"] is None  # default

    def test_row_null_meta_json(self) -> None:
        row = self._make_row(meta_json=None)
        result = _saved_image_row_to_dict(row)
        assert result["meta"] == {}

    def test_row_null_workflow_json(self) -> None:
        row = self._make_row(workflow_json=None)
        result = _saved_image_row_to_dict(row)
        assert result["workflow"] == {}