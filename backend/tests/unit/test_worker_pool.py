"""
Unit tests for backend.src.worker_pool.

ComfyWorker is mocked via patch() so that no network access is required
and no sys.modules pollution occurs across test files.
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.src.worker_pool import (
    DEFAULT_COMFYUI_URL,
    WorkerPool,
    read_env_worker_urls,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_worker_seq = 0


def _make_mock_worker(worker_id: str, base_url: str) -> MagicMock:
    """Return a MagicMock that behaves like a BaseWorker instance."""
    w = MagicMock()
    w.id = worker_id
    w.base_url = base_url.rstrip("/")
    w.alive = False
    w.busy = False
    w.current_job_id = None
    w.worker_type = "comfyui"
    w._on_message = None
    w._on_binary = None
    w._on_status_change = None
    w.start = AsyncMock()
    w.stop = AsyncMock()
    w.info = MagicMock()
    return w


def _mock_worker_factory(*args, **kwargs):
    """Drop-in replacement for WORKER_REGISTRY[worker_type](*args, **kwargs)."""
    global _worker_seq
    worker_id = args[0] if args else kwargs.get("worker_id", f"worker-{_worker_seq}")
    base_url = args[1] if len(args) > 1 else kwargs.get("base_url", DEFAULT_COMFYUI_URL)
    w = _make_mock_worker(worker_id, base_url)
    _worker_seq += 1
    return w


@pytest.fixture(autouse=True)
def _reset_seq():
    global _worker_seq
    _worker_seq = 0
    yield
    _worker_seq = 0


@pytest.fixture
def mock_worker_cls():
    """Patch WORKER_REGISTRY to use mock worker factory."""
    with patch(
        "backend.src.worker_pool.WORKER_REGISTRY",
        {"comfyui": MagicMock(side_effect=_mock_worker_factory)},
    ) as m:
        yield m


@pytest.fixture
def mock_worker_info_cls():
    """Patch WorkerInfo so that pool.info() returns simple objects."""
    with patch(
        "backend.src.worker_pool.WorkerInfo",
        side_effect=lambda **kw: type("WorkerInfo", (), kw),
    ) as m:
        yield m


# ---------------------------------------------------------------------------
# read_env_worker_urls
# ---------------------------------------------------------------------------

class TestReadEnvWorkerUrls:
    """Tests for the free function read_env_worker_urls()."""

    def test_returns_empty_when_env_missing(self):
        env = os.environ.copy()
        env.pop("COMFYUI_WORKERS", None)
        with patch.dict(os.environ, env, clear=True):
            assert read_env_worker_urls() == []

    def test_returns_empty_for_empty_string(self):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": ""}):
            assert read_env_worker_urls() == []

    def test_single_url(self):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": "http://localhost:8188"}):
            assert read_env_worker_urls() == ["http://localhost:8188"]

    def test_multiple_urls_comma_separated(self):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": "http://localhost:8188,http://gpu2:8189"}):
            result = read_env_worker_urls()
            assert result == ["http://localhost:8188", "http://gpu2:8189"]

    def test_whitespace_handling(self):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": "  http://a:1 , http://b:2  , http://c:3  "}):
            result = read_env_worker_urls()
            assert result == ["http://a:1", "http://b:2", "http://c:3"]

    def test_trailing_commas_and_empty_parts_are_ignored(self):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": "http://a:1,,http://b:2,"}):
            result = read_env_worker_urls()
            assert result == ["http://a:1", "http://b:2"]


# ---------------------------------------------------------------------------
# WorkerPool init
# ---------------------------------------------------------------------------

class TestWorkerPoolInit:

    def test_default_url_when_no_urls_and_no_env(self, mock_worker_cls):
        env = os.environ.copy()
        env.pop("COMFYUI_WORKERS", None)
        with patch.dict(os.environ, env, clear=True):
            pool = WorkerPool()
        assert pool.has_url(DEFAULT_COMFYUI_URL)

    def test_default_url_creates_one_worker(self, mock_worker_cls):
        env = os.environ.copy()
        env.pop("COMFYUI_WORKERS", None)
        with patch.dict(os.environ, env, clear=True):
            pool = WorkerPool()
        assert len(pool.all()) == 1

    def test_custom_urls(self, mock_worker_cls):
        urls = ["http://gpu1:8188", "http://gpu2:8189"]
        pool = WorkerPool(urls=urls)
        assert len(pool.all()) == 2
        assert pool.has_url("http://gpu1:8188")
        assert pool.has_url("http://gpu2:8189")

    def test_env_urls_used_when_no_explicit_urls(self, mock_worker_cls):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": "http://env:1234"}):
            pool = WorkerPool()
        assert pool.has_url("http://env:1234")
        assert not pool.has_url(DEFAULT_COMFYUI_URL)

    def test_explicit_urls_override_env(self, mock_worker_cls):
        with patch.dict(os.environ, {"COMFYUI_WORKERS": "http://env:1234"}):
            pool = WorkerPool(urls=["http://explicit:8188"])
        assert pool.has_url("http://explicit:8188")
        assert not pool.has_url("http://env:1234")


# ---------------------------------------------------------------------------
# WorkerPool add / remove
# ---------------------------------------------------------------------------

class TestWorkerPoolAdd:

    async def test_add_creates_and_starts_worker(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        worker = await pool.add("http://new:8188")
        assert pool.has_url("http://new:8188")
        worker.start.assert_awaited_once()

    async def test_add_duplicate_url_raises_value_error(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        with pytest.raises(ValueError, match="URL already registered"):
            await pool.add("http://localhost:8188")

    async def test_add_duplicate_url_with_trailing_slash_raises(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        with pytest.raises(ValueError, match="URL already registered"):
            await pool.add("http://localhost:8188/")


class TestWorkerPoolRemove:

    async def test_remove_stops_and_returns_worker(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        workers = pool.all()
        assert len(workers) == 1
        removed = await pool.remove(workers[0].id)
        assert removed is workers[0]
        assert len(pool.all()) == 0
        removed.stop.assert_awaited_once()

    async def test_remove_unknown_returns_none(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        result = await pool.remove("nonexistent-id")
        assert result is None


# ---------------------------------------------------------------------------
# WorkerPool start / stop
# ---------------------------------------------------------------------------

class TestWorkerPoolStartStop:

    async def test_start_calls_start_on_all_workers(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188", "http://b:8189"])
        for w in pool.all():
            w.start.reset_mock()
        await pool.start()
        for w in pool.all():
            w.start.assert_awaited_once()

    async def test_stop_calls_stop_on_all_workers(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188", "http://b:8189"])
        for w in pool.all():
            w.stop.reset_mock()
        await pool.stop()
        for w in pool.all():
            w.stop.assert_awaited_once()


# ---------------------------------------------------------------------------
# has_url
# ---------------------------------------------------------------------------

class TestHasUrl:

    def test_url_without_trailing_slash(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        assert pool.has_url("http://localhost:8188") is True

    def test_url_with_trailing_slash_matches(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        assert pool.has_url("http://localhost:8188/") is True

    def test_unknown_url(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://localhost:8188"])
        assert pool.has_url("http://unknown:9999") is False


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------

class TestAccessHelpers:

    def test_all_returns_list_of_workers(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188", "http://b:8189"])
        assert len(pool.all()) == 2

    def test_get_returns_worker_by_id(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        worker = pool.all()[0]
        assert pool.get(worker.id) is worker

    def test_get_returns_none_for_unknown_id(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        assert pool.get("no-such-id") is None


# ---------------------------------------------------------------------------
# find_idle
# ---------------------------------------------------------------------------

class TestFindIdle:

    def test_find_idle_returns_first_alive_idle_worker(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188", "http://b:8189"])
        workers = pool.all()
        workers[0].alive = True
        workers[0].busy = True
        workers[1].alive = True
        workers[1].busy = False
        result = pool.find_idle()
        assert result is workers[1]

    def test_find_idle_skips_busy_worker(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188", "http://b:8189"])
        workers = pool.all()
        workers[0].alive = True
        workers[0].busy = True
        workers[1].alive = True
        workers[1].busy = False
        assert pool.find_idle() is workers[1]

    def test_find_idle_returns_none_when_all_dead(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        workers = pool.all()
        workers[0].alive = False
        assert pool.find_idle() is None

    def test_find_idle_returns_none_when_all_busy(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        workers = pool.all()
        workers[0].alive = True
        workers[0].busy = True
        assert pool.find_idle() is None


# ---------------------------------------------------------------------------
# info
# ---------------------------------------------------------------------------

class TestInfo:

    def test_info_returns_worker_info_list(self, mock_worker_cls, mock_worker_info_cls):
        pool = WorkerPool(urls=["http://a:8188", "http://b:8189"])
        workers = pool.all()
        workers[0].alive = True
        workers[0].base_url = "http://a:8188"
        workers[1].alive = True
        workers[1].base_url = "http://b:8189"
        infos = pool.info()
        assert len(infos) == 2


# ---------------------------------------------------------------------------
# set_handlers
# ---------------------------------------------------------------------------

class TestSetHandlers:

    def test_set_handlers_propagates_to_existing_workers(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        on_msg = AsyncMock()
        on_status = AsyncMock()
        pool.set_handlers(on_message=on_msg, on_status_change=on_status)
        for w in pool.all():
            assert w._on_message is on_msg
            assert w._on_status_change is on_status

    async def test_handlers_applied_to_newly_added_worker(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        on_msg = AsyncMock()
        pool.set_handlers(on_message=on_msg)
        new_worker = await pool.add("http://b:8189")
        assert new_worker._on_message is on_msg

    def test_set_handlers_propagates_on_binary_and_on_status_change(self, mock_worker_cls):
        pool = WorkerPool(urls=["http://a:8188"])
        on_bin = AsyncMock()
        on_sc = AsyncMock()
        pool.set_handlers(on_binary=on_bin, on_status_change=on_sc)
        for w in pool.all():
            assert w._on_binary is on_bin
            assert w._on_status_change is on_sc