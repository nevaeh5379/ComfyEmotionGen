"""
Tests for curation-related API endpoints:
  GET    /saved-images            — list saved images
  GET    /saved-images/{hash}/meta — image metadata
  PATCH  /saved-images/{hash}     — update curation status/note
  POST   /saved-images/{hash}/tags — add tags
  DELETE /saved-images/{hash}/tags/{tag} — remove a tag
  POST   /saved-images/{hash}/restore — restore from trash
  GET    /tags                    — list tag counts
  GET    /trash                   — list trashed images
  POST   /trash/empty             — empty trash
  GET    /asset-groups            — list asset groups
  GET    /asset-groups/{filename} — get group detail
"""
from __future__ import annotations

import pytest_asyncio


def _get_store():
    """Access the JobStore from the live app's job_manager (set by lifespan)."""
    from backend.src.server import job_manager
    return job_manager._store


async def _seed_image(store, *, hash_suffix: str = "", job_id: str = "job-1",
                      filename: str = "test.png", status: str = "pending",
                      tags: list[str] | None = None, **kwargs) -> str:
    """Insert a saved_image row and return its hash."""
    h = kwargs.get("hash") or f"abc123{hash_suffix}"
    await store.save_image_record(
        hash=h,
        job_id=kwargs.get("job_id", job_id),
        original_filename=kwargs.get("original_filename", filename),
        comfy_filename=kwargs.get("comfy_filename", filename),
        subfolder=kwargs.get("subfolder", ""),
        type_=kwargs.get("type_", "output"),
        worker_id=kwargs.get("worker_id", "worker-1"),
        extension=kwargs.get("extension", ".png"),
        size_bytes=kwargs.get("size_bytes", 1024),
        prompt=kwargs.get("prompt", "test prompt"),
        meta=kwargs.get("meta"),
        ceg_template=kwargs.get("ceg_template", ""),
        workflow=kwargs.get("workflow"),
    )
    if tags:
        await store.add_tags(h, tags)
    if status != "pending":
        await store.update_curation(h, status=status)
    return h


# ═══════════════════════════════════════════════════════════════
#  GET /saved-images
# ═══════════════════════════════════════════════════════════════


class TestSavedImagesList:
    """GET /saved-images — list with optional filters."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await _seed_image(self.store, hash_suffix="01", filename="img_01.png")
        await _seed_image(self.store, hash_suffix="02", filename="img_02.png",
                          status="approved")
        await _seed_image(self.store, hash_suffix="03", filename="img_03.png",
                          status="trashed")

    def test_list_returns_items_and_total(self, client):
        resp = client.get("/saved-images")
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "total" in body
        assert "limit" in body
        assert "offset" in body
        assert body["total"] >= 3

    def test_list_default_limit_and_offset(self, client):
        resp = client.get("/saved-images")
        body = resp.json()
        assert body["limit"] == 100
        assert body["offset"] == 0

    def test_list_with_status_filter(self, client):
        resp = client.get("/saved-images", params={"status": "approved"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        for item in items:
            assert item["status"] == "approved"

    def test_list_with_filename_filter(self, client):
        resp = client.get("/saved-images", params={"filename": "img_01.png"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        for item in items:
            assert item["originalFilename"] == "img_01.png"

    async def test_list_with_tag_filter(self, client):
        await self.store.add_tags("abc12301", ["portrait"])
        resp = client.get("/saved-images", params={"tag": "portrait"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1
        for item in items:
            assert "portrait" in item.get("tags", [])

    def test_list_with_job_id_filter(self, client):
        resp = client.get("/saved-images", params={"job_id": "job-1"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        for item in items:
            assert item["jobId"] == "job-1"

    def test_list_pagination(self, client):
        resp = client.get("/saved-images", params={"limit": 1, "offset": 0})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) <= 1
        assert body["limit"] == 1
        assert body["offset"] == 0

    def test_list_empty_result(self, client):
        """When no images match a filter, return empty list with total=0."""
        resp = client.get("/saved-images", params={"status": "nonexistent"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0


# ═══════════════════════════════════════════════════════════════
#  PATCH /saved-images/{hash}
# ═══════════════════════════════════════════════════════════════


class TestSavedImagesPatch:
    """PATCH /saved-images/{hash} — curation status/note updates."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        self.hash = await _seed_image(self.store, hash_suffix="P1",
                                      filename="patch_test.png")

    def test_patch_status_to_approved(self, client):
        resp = client.patch(f"/saved-images/{self.hash}",
                            json={"status": "approved"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "approved"
        assert data["hash"] == self.hash

    def test_patch_status_to_rejected(self, client):
        resp = client.patch(f"/saved-images/{self.hash}",
                            json={"status": "rejected"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "rejected"

    def test_patch_status_to_trashed(self, client):
        resp = client.patch(f"/saved-images/{self.hash}",
                            json={"status": "trashed"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "trashed"
        assert data.get("trashedAt") is not None

    def test_patch_note(self, client):
        resp = client.patch(f"/saved-images/{self.hash}",
                            json={"note": "good image"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["note"] == "good image"

    def test_patch_both_status_and_note(self, client):
        resp = client.patch(f"/saved-images/{self.hash}",
                            json={"status": "approved", "note": "looks great"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "approved"
        assert data["note"] == "looks great"

    def test_patch_nonexistent_hash_returns_404(self, client):
        resp = client.patch("/saved-images/nonexistent123",
                            json={"status": "approved"})
        assert resp.status_code == 404

    def test_patch_note_to_empty_string(self, client):
        # First set a note
        client.patch(f"/saved-images/{self.hash}", json={"note": "temp"})
        # Then clear it
        resp = client.patch(f"/saved-images/{self.hash}", json={"note": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data["note"] == ""

    def test_patch_status_pending_clears_trashed_at(self, client):
        # Trash first
        client.patch(f"/saved-images/{self.hash}", json={"status": "trashed"})
        # Then restore to pending
        resp = client.patch(f"/saved-images/{self.hash}",
                            json={"status": "pending"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert data.get("trashedAt") is None


# ═══════════════════════════════════════════════════════════════
#  POST /saved-images/{hash}/tags  &  DELETE /saved-images/{hash}/tags/{tag}
# ═══════════════════════════════════════════════════════════════


class TestSavedImagesTags:
    """Add and remove tags on saved images."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        self.hash = await _seed_image(self.store, hash_suffix="T1",
                                      filename="tag_test.png")

    def test_add_tags(self, client):
        resp = client.post(f"/saved-images/{self.hash}/tags",
                           json={"tags": ["landscape", "nature"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["hash"] == self.hash
        assert "landscape" in data["tags"]
        assert "nature" in data["tags"]

    def test_add_duplicate_tags_are_idempotent(self, client):
        client.post(f"/saved-images/{self.hash}/tags",
                    json={"tags": ["portrait"]})
        resp = client.post(f"/saved-images/{self.hash}/tags",
                           json={"tags": ["portrait"]})
        assert resp.status_code == 200
        tags = resp.json()["tags"]
        assert tags.count("portrait") == 1

    def test_add_tags_to_nonexistent_hash_returns_404(self, client):
        resp = client.post("/saved-images/nonexistent999/tags",
                           json={"tags": ["test"]})
        assert resp.status_code == 404

    def test_remove_tag(self, client):
        # Add tags first
        client.post(f"/saved-images/{self.hash}/tags",
                    json={"tags": ["a", "b", "c"]})
        # Remove one
        resp = client.delete(f"/saved-images/{self.hash}/tags/b")
        assert resp.status_code == 200
        data = resp.json()
        assert "b" not in data["tags"]
        assert "a" in data["tags"]
        assert "c" in data["tags"]

    def test_remove_nonexistent_tag_still_succeeds(self, client):
        # Tag doesn't exist but hash is valid — returns current tags
        resp = client.delete(f"/saved-images/{self.hash}/tags/nonexistent")
        assert resp.status_code == 200
        assert "tags" in resp.json()

    def test_remove_tag_from_nonexistent_hash_returns_404(self, client):
        resp = client.delete("/saved-images/nonexistent999/tags/a")
        assert resp.status_code == 404

    def test_add_empty_tag_is_ignored(self, client):
        resp = client.post(f"/saved-images/{self.hash}/tags",
                           json={"tags": ["", "  ", "valid"]})
        assert resp.status_code == 200
        tags = resp.json()["tags"]
        assert "" not in tags
        assert "valid" in tags


# ═══════════════════════════════════════════════════════════════
#  POST /saved-images/{hash}/restore
# ═══════════════════════════════════════════════════════════════


class TestSavedImagesRestore:
    """POST /saved-images/{hash}/restore — restore from trash."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        self.trashed_hash = await _seed_image(
            self.store, hash_suffix="R1",
            filename="restore_test.png", status="trashed")
        self.pending_hash = await _seed_image(
            self.store, hash_suffix="R2",
            filename="pending_restore.png")

    def test_restore_trashed_image(self, client):
        resp = client.post(f"/saved-images/{self.trashed_hash}/restore")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert data.get("trashedAt") is None

    def test_restore_nonexistent_hash_returns_404(self, client):
        resp = client.post("/saved-images/nonexistent888/restore")
        assert resp.status_code == 404

    def test_restore_already_pending_image(self, client):
        """Restoring an already-pending image should still succeed."""
        resp = client.post(f"/saved-images/{self.pending_hash}/restore")
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"


# ═══════════════════════════════════════════════════════════════
#  GET /tags
# ═══════════════════════════════════════════════════════════════


class TestTagsList:
    """GET /tags — list tag usage counts."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        h1 = await _seed_image(self.store, hash_suffix="TA1",
                                filename="tag1.png")
        h2 = await _seed_image(self.store, hash_suffix="TA2",
                                filename="tag2.png")
        h3 = await _seed_image(self.store, hash_suffix="TA3",
                                filename="tag3.png")
        await self.store.add_tags(h1, ["portrait_taglist", "outdoor_taglist"])
        await self.store.add_tags(h2, ["portrait_taglist", "indoor_taglist"])
        await self.store.add_tags(h3, ["landscape_taglist"])

    def test_list_tags_returns_counts(self, client):
        resp = client.get("/tags")
        assert resp.status_code == 200
        body = resp.json()
        assert "tags" in body
        tags = body["tags"]
        portrait = next((t for t in tags if t["tag"] == "portrait_taglist"), None)
        assert portrait is not None
        assert portrait["count"] >= 2

    def test_list_tags_returns_list(self, client):
        resp = client.get("/tags")
        assert resp.status_code == 200
        assert isinstance(resp.json()["tags"], list)


# ═══════════════════════════════════════════════════════════════
#  GET /trash
# ═══════════════════════════════════════════════════════════════


class TestTrashList:
    """GET /trash — list trashed images."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await _seed_image(self.store, hash_suffix="TR1",
                          filename="trash_test.png", status="trashed")
        await _seed_image(self.store, hash_suffix="TR2",
                          filename="not_trash.png", status="approved")

    def test_trash_list_returns_only_trashed(self, client):
        resp = client.get("/trash")
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "limit" in body
        assert "offset" in body
        for item in body["items"]:
            assert item["status"] == "trashed"

    def test_trash_list_pagination(self, client):
        resp = client.get("/trash", params={"limit": 10, "offset": 0})
        assert resp.status_code == 200
        body = resp.json()
        assert body["limit"] == 10
        assert body["offset"] == 0

    def test_trash_list_default_params(self, client):
        resp = client.get("/trash")
        body = resp.json()
        assert body["limit"] == 200
        assert body["offset"] == 0


# ═══════════════════════════════════════════════════════════════
#  POST /trash/empty
# ═══════════════════════════════════════════════════════════════


class TestTrashEmpty:
    """POST /trash/empty — permanently delete trashed images."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await _seed_image(self.store, hash_suffix="TE1",
                          filename="to_empty.png", status="trashed")
        await _seed_image(self.store, hash_suffix="TE2",
                          filename="to_keep.png", status="approved")

    def test_empty_trash_deletes_trashed(self, client):
        resp = client.post("/trash/empty")
        assert resp.status_code == 200
        data = resp.json()
        assert "deleted" in data
        assert data["deleted"] >= 1

        # Verify approved image is NOT in trash
        trash_resp = client.get("/trash")
        trash_items = trash_resp.json()["items"]
        hashes_in_trash = [it["hash"] for it in trash_items]
        assert "abc123TE2" not in hashes_in_trash

    def test_empty_trash_when_already_empty(self, client):
        """Emptying an already-empty trash returns deleted=0."""
        client.post("/trash/empty")
        resp = client.post("/trash/empty")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 0

    def test_empty_trash_does_not_delete_approved(self, client):
        """Approved images should survive trash emptying."""
        client.post("/trash/empty")
        saved = client.get("/saved-images", params={"status": "approved"})
        items = saved.json()["items"]
        assert any(i["hash"] == "abc123TE2" for i in items)


# ═══════════════════════════════════════════════════════════════
#  GET /asset-groups
# ═══════════════════════════════════════════════════════════════


class TestAssetGroupsList:
    """GET /asset-groups — list filename-based groups."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await _seed_image(self.store, hash_suffix="AG1",
                          filename="character_a.png")
        await _seed_image(self.store, hash_suffix="AG2",
                          filename="character_a.png", status="approved")
        await _seed_image(self.store, hash_suffix="AG3",
                          filename="character_b.png")

    def test_list_asset_groups(self, client):
        resp = client.get("/asset-groups")
        assert resp.status_code == 200
        body = resp.json()
        assert "groups" in body
        assert "limit" in body
        assert "offset" in body
        assert "sort" in body
        groups = body["groups"]
        filenames = [g["filename"] for g in groups]
        assert "character_a.png" in filenames
        assert "character_b.png" in filenames

    def test_asset_group_counts(self, client):
        resp = client.get("/asset-groups")
        groups = resp.json()["groups"]
        group_a = next(g for g in groups if g["filename"] == "character_a.png")
        assert group_a["total"] == 2

    def test_asset_groups_sort_by_name(self, client):
        resp = client.get("/asset-groups", params={"sort": "name"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["sort"] == "name"
        filenames = [g["filename"] for g in body["groups"]]
        assert filenames == sorted(filenames)

    def test_asset_groups_sort_by_latest(self, client):
        resp = client.get("/asset-groups", params={"sort": "latest"})
        assert resp.status_code == 200
        assert resp.json()["sort"] == "latest"

    def test_asset_groups_pagination(self, client):
        resp = client.get("/asset-groups", params={"limit": 1, "offset": 0})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["groups"]) <= 1
        assert body["limit"] == 1
        assert body["offset"] == 0


# ═══════════════════════════════════════════════════════════════
#  GET /asset-groups/{filename}
# ═══════════════════════════════════════════════════════════════


class TestAssetGroupDetail:
    """GET /asset-groups/{filename} — images for a specific filename."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await _seed_image(self.store, hash_suffix="GD1",
                          filename="detail_test.png")
        await _seed_image(self.store, hash_suffix="GD2",
                          filename="detail_test.png", status="approved")
        await _seed_image(self.store, hash_suffix="GD3",
                          filename="other_file.png")

    def test_group_detail_returns_images(self, client):
        resp = client.get("/asset-groups/detail_test.png")
        assert resp.status_code == 200
        body = resp.json()
        assert body["filename"] == "detail_test.png"
        assert len(body["items"]) == 2

    def test_group_detail_with_status_filter(self, client):
        resp = client.get("/asset-groups/detail_test.png",
                          params={"status": "approved"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        for item in items:
            assert item["status"] == "approved"
        assert len(items) == 1

    def test_group_detail_nonexistent_filename(self, client):
        resp = client.get("/asset-groups/no_such_file.png")
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["filename"] == "no_such_file.png"


# ═══════════════════════════════════════════════════════════════
#  GET /saved-images/{hash}/meta
# ═══════════════════════════════════════════════════════════════


class TestSavedImageMeta:
    """GET /saved-images/{hash}/meta — metadata for a single image."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        self.hash = await _seed_image(self.store, hash_suffix="M1",
                                      filename="meta_test.png")

    def test_get_meta_returns_image_data(self, client):
        resp = client.get(f"/saved-images/{self.hash}/meta")
        assert resp.status_code == 200
        data = resp.json()
        assert data["hash"] == self.hash
        assert data["originalFilename"] == "meta_test.png"
        assert "status" in data
        assert "tags" in data

    def test_get_meta_nonexistent_returns_404(self, client):
        resp = client.get("/saved-images/nonexistent555/meta")
        assert resp.status_code == 404