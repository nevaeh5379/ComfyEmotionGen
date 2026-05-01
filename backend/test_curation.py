"""
test_curation.py
JobStore의 큐레이션/태그/asset-groups CRUD 단위 테스트.
실행: pytest test_curation.py -v
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
import pytest_asyncio

from job_store import JobStore


@pytest_asyncio.fixture
async def store(tmp_path: Path):
    s = JobStore(db_path=tmp_path / "test.db")
    await s.open()
    try:
        yield s
    finally:
        await s.close()


async def _seed_image(
    store: JobStore,
    *,
    hash: str,
    job_id: str = "j1",
    filename: str = "char_a",
    prompt: str = "1girl",
    extension: str = ".png",
) -> None:
    # save_image_record는 saved_images 테이블에 직접 기록
    await store.save_image_record(
        hash=hash,
        job_id=job_id,
        original_filename=filename,
        comfy_filename=f"comfy_{hash[:6]}.png",
        subfolder="",
        type_="output",
        worker_id="w1",
        extension=extension,
        size_bytes=1024,
        prompt=prompt,
    )


@pytest.mark.asyncio
async def test_default_status_is_pending(store: JobStore):
    await _seed_image(store, hash="aaa")
    rec = await store.get_saved_image("aaa")
    assert rec is not None
    assert rec["status"] == "pending"
    assert rec["note"] == ""
    assert rec["trashedAt"] is None
    assert rec["tags"] == []


@pytest.mark.asyncio
async def test_update_curation_status_sets_trashed_at(store: JobStore):
    await _seed_image(store, hash="bbb")
    updated = await store.update_curation("bbb", status="trashed")
    assert updated is not None
    assert updated["status"] == "trashed"
    assert updated["trashedAt"] is not None

    restored = await store.update_curation("bbb", status="pending")
    assert restored["status"] == "pending"
    assert restored["trashedAt"] is None


@pytest.mark.asyncio
async def test_update_curation_note(store: JobStore):
    await _seed_image(store, hash="ccc")
    updated = await store.update_curation("ccc", note="손가락 이상함")
    assert updated["note"] == "손가락 이상함"
    # status는 건드리지 않음
    assert updated["status"] == "pending"


@pytest.mark.asyncio
async def test_update_curation_missing_returns_none(store: JobStore):
    assert await store.update_curation("nope", status="approved") is None


@pytest.mark.asyncio
async def test_tags_add_remove(store: JobStore):
    await _seed_image(store, hash="ddd")
    tags = await store.add_tags("ddd", ["대표", "재작업"])
    assert set(tags) == {"대표", "재작업"}
    # idempotent
    again = await store.add_tags("ddd", ["대표"])
    assert set(again) == {"대표", "재작업"}
    # 빈 문자열은 무시
    cleaned = await store.add_tags("ddd", ["", "  "])
    assert set(cleaned) == {"대표", "재작업"}
    removed = await store.remove_tag("ddd", "재작업")
    assert removed == ["대표"]


@pytest.mark.asyncio
async def test_list_filter_status(store: JobStore):
    await _seed_image(store, hash="h1", filename="a")
    await _seed_image(store, hash="h2", filename="a")
    await store.update_curation("h2", status="approved")
    approved = await store.list_saved_images(status="approved")
    assert [r["hash"] for r in approved] == ["h2"]
    pending = await store.list_saved_images(status="pending")
    assert [r["hash"] for r in pending] == ["h1"]


@pytest.mark.asyncio
async def test_list_filter_tag_and_filename(store: JobStore):
    await _seed_image(store, hash="t1", filename="char_a")
    await _seed_image(store, hash="t2", filename="char_b")
    await store.add_tags("t1", ["대표"])
    await store.add_tags("t2", ["대표"])

    by_tag = await store.list_saved_images(tag="대표")
    assert {r["hash"] for r in by_tag} == {"t1", "t2"}

    by_filename = await store.list_saved_images(filename="char_a")
    assert [r["hash"] for r in by_filename] == ["t1"]

    combined = await store.list_saved_images(tag="대표", filename="char_b")
    assert [r["hash"] for r in combined] == ["t2"]


@pytest.mark.asyncio
async def test_list_includes_tags(store: JobStore):
    await _seed_image(store, hash="x1")
    await store.add_tags("x1", ["A", "B"])
    items = await store.list_saved_images()
    target = next(it for it in items if it["hash"] == "x1")
    assert set(target["tags"]) == {"A", "B"}


@pytest.mark.asyncio
async def test_list_tag_counts(store: JobStore):
    await _seed_image(store, hash="i1")
    await _seed_image(store, hash="i2")
    await store.add_tags("i1", ["대표", "보류"])
    await store.add_tags("i2", ["대표"])
    counts = await store.list_tag_counts()
    by_name = {c["tag"]: c["count"] for c in counts}
    assert by_name == {"대표": 2, "보류": 1}


@pytest.mark.asyncio
async def test_list_trashed_for_purge_and_delete(store: JobStore):
    await _seed_image(store, hash="p1")
    await _seed_image(store, hash="p2")
    await store.update_curation("p1", status="trashed")
    targets = await store.list_trashed_for_purge()
    assert {t["hash"] for t in targets} == {"p1"}
    assert targets[0]["extension"] == ".png"

    deleted = await store.delete_saved_image("p1")
    assert deleted is True
    assert await store.get_saved_image("p1") is None
    # 다른 이미지는 영향 없음
    assert await store.get_saved_image("p2") is not None


@pytest.mark.asyncio
async def test_delete_cascades_tags(store: JobStore):
    await _seed_image(store, hash="c1")
    await store.add_tags("c1", ["X"])
    await store.delete_saved_image("c1")
    counts = await store.list_tag_counts()
    assert all(c["tag"] != "X" for c in counts)


@pytest.mark.asyncio
async def test_asset_groups_aggregate(store: JobStore):
    await _seed_image(store, hash="g1", filename="grp_a")
    await _seed_image(store, hash="g2", filename="grp_a")
    await _seed_image(store, hash="g3", filename="grp_b")
    await store.update_curation("g1", status="approved")
    await store.update_curation("g2", status="trashed")
    groups = await store.list_asset_groups()
    by_name = {g["filename"]: g for g in groups}
    assert by_name["grp_a"]["total"] == 2
    assert by_name["grp_a"]["approvedCount"] == 1
    assert by_name["grp_a"]["trashedCount"] == 1
    assert by_name["grp_a"]["pendingCount"] == 0
    assert by_name["grp_b"]["total"] == 1
    assert by_name["grp_b"]["pendingCount"] == 1
    # sampleHash가 그룹의 어느 하나여야 함
    assert by_name["grp_a"]["sampleHash"] in {"g1", "g2"}


@pytest.mark.asyncio
async def test_get_latest_job_by_filename(store: JobStore):
    # jobs 테이블에 직접 INSERT (save 사용)
    base = {
        "id": "old",
        "filename": "shared",
        "prompt": "p1",
        "_workflow": {"k": "v1"},
        "status": "done",
        "workerId": None,
        "error": None,
        "imageUrls": [],
        "progressPercent": 0.0,
        "currentNodeName": "",
        "createdAt": time.time() - 100,
        "startedAt": None,
        "finishedAt": None,
        "retryCount": 0,
        "executionDurationMs": None,
    }
    await store.save(base)
    new = dict(base, id="new", _workflow={"k": "v2"}, createdAt=time.time())
    await store.save(new)

    latest = await store.get_latest_job_by_filename("shared")
    assert latest is not None
    assert latest["id"] == "new"
    assert latest["_workflow"] == {"k": "v2"}

    assert await store.get_latest_job_by_filename("missing") is None
