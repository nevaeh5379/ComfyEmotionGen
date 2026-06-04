"""
Unit tests for backend.src.webhook.

WebhookService HTTP calls are mocked at the instance level (_http_post)
so no real network access occurs.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from backend.src.webhook import (
    WEBHOOK_EVENTS,
    WebhookConfig,
    WebhookService,
    _iso_now,
    _tg_escape,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def svc(tmp_store):
    """Return a WebhookService backed by the shared tmp_store fixture."""
    s = WebhookService(store=tmp_store, base_url="http://localhost:8080")
    await s.load()
    return s


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


class TestIsoNow:
    def test_returns_iso_format(self):
        result = _iso_now()
        # ISO 8601 format: must contain 'T' and end with '+00:00' or 'Z' or offset
        assert "T" in result
        # Must be parseable
        from datetime import datetime, timezone

        dt = datetime.fromisoformat(result)
        assert dt.tzinfo is not None


class TestTgEscape:
    def test_no_special_chars(self):
        assert _tg_escape("hello world") == "hello world"

    def test_ampersand(self):
        assert _tg_escape("a & b") == "a &amp; b"

    def test_less_than(self):
        assert _tg_escape("a < b") == "a &lt; b"

    def test_greater_than(self):
        assert _tg_escape("a > b") == "a &gt; b"

    def test_all_special(self):
        assert _tg_escape("<&>") == "&lt;&amp;&gt;"

    def test_empty_string(self):
        assert _tg_escape("") == ""

    def test_already_escaped_not_double_escaped(self):
        # _tg_escape is simple char replacement, not idempotent on pre-escaped input
        # but we verify it handles the raw chars correctly
        assert _tg_escape("&lt;") == "&amp;lt;"


# ---------------------------------------------------------------------------
# Load / Save roundtrip
# ---------------------------------------------------------------------------


class TestLoadSave:
    async def test_load_empty(self, svc):
        """Loading from an empty store yields no configs."""
        assert svc._configs == []
        assert svc.list_configs() == []

    async def test_save_and_load_roundtrip(self, svc, tmp_store):
        """Configs survive a save → new instance load cycle."""
        cfg = await svc.add_config(
            name="Discord Hook",
            channel_type="discord",
            url="https://discord.example.com/webhook",
            events=["job_done"],
            enabled=True,
        )

        # Create a fresh service to verify persistence
        svc2 = WebhookService(store=tmp_store)
        await svc2.load()
        configs = svc2.list_configs()
        assert len(configs) == 1
        assert configs[0]["id"] == cfg.id
        assert configs[0]["name"] == "Discord Hook"
        assert configs[0]["channel_type"] == "discord"
        assert configs[0]["events"] == ["job_done"]
        assert configs[0]["enabled"] is True

    async def test_save_multiple_configs(self, svc, tmp_store):
        """Multiple configs roundtrip correctly."""
        c1 = await svc.add_config("dc", "discord", "https://d.com/w", ["job_done"])
        c2 = await svc.add_config("tg", "telegram", "123456:ABC", ["job_error"])
        c3 = await svc.add_config("gen", "generic", "https://g.com/hook", WEBHOOK_EVENTS)

        svc2 = WebhookService(store=tmp_store)
        await svc2.load()
        ids = {c["id"] for c in svc2.list_configs()}
        assert ids == {c1.id, c2.id, c3.id}

    async def test_load_corrupt_json(self, tmp_store):
        """Corrupt JSON in the store is tolerated (configs reset to empty)."""
        await tmp_store.save_setting("webhook_configs", "}}not valid json{{")
        svc = WebhookService(store=tmp_store)
        await svc.load()
        assert svc._configs == []

    async def test_load_missing_keys_defaults(self, tmp_store):
        """Configs missing optional keys get sensible defaults."""
        raw = json.dumps([
            {
                "id": "abc123",
                "name": "test",
                "channel_type": "discord",
                "url": "https://example.com",
                # events, enabled, include_image omitted
            }
        ])
        await tmp_store.save_setting("webhook_configs", raw)
        svc = WebhookService(store=tmp_store)
        await svc.load()
        configs = svc.list_configs()
        assert len(configs) == 1
        assert configs[0]["events"] == WEBHOOK_EVENTS
        assert configs[0]["enabled"] is True
        assert configs[0]["include_image"] is False


# ---------------------------------------------------------------------------
# add_config
# ---------------------------------------------------------------------------


class TestAddConfig:
    async def test_add_discord(self, svc):
        cfg = await svc.add_config(
            name="My Discord",
            channel_type="discord",
            url="https://discord.com/webhookid",
            events=["job_done", "job_error"],
        )
        assert cfg.channel_type == "discord"
        assert cfg.enabled is True
        assert cfg.include_image is False

        listed = svc.list_configs()
        assert len(listed) == 1
        assert listed[0]["name"] == "My Discord"

    async def test_add_telegram(self, svc):
        cfg = await svc.add_config(
            name="TG Bot",
            channel_type="telegram",
            url="123456:ABC-DEF",
            events=["batch_completed"],
            enabled=False,
        )
        assert cfg.channel_type == "telegram"
        assert cfg.enabled is False

    async def test_add_generic(self, svc):
        cfg = await svc.add_config(
            name="Generic Hook",
            channel_type="generic",
            url="https://example.com/hook",
            events=WEBHOOK_EVENTS,
            include_image=True,
        )
        assert cfg.channel_type == "generic"
        assert cfg.include_image is True

    async def test_add_strips_url_whitespace(self, svc):
        cfg = await svc.add_config(
            name="ws",
            channel_type="discord",
            url="  https://example.com/hook  ",
            events=["job_done"],
        )
        assert cfg.url == "https://example.com/hook"

    async def test_add_persists_via_save(self, svc, tmp_store):
        await svc.add_config("p", "generic", "https://x.com", ["job_done"])
        # Verify the store actually has data
        raw = await tmp_store.get_setting("webhook_configs")
        data = json.loads(raw)
        assert len(data) == 1
        assert data[0]["name"] == "p"


# ---------------------------------------------------------------------------
# update_config
# ---------------------------------------------------------------------------


class TestUpdateConfig:
    async def test_update_name(self, svc):
        cfg = await svc.add_config("original", "discord", "https://d.com/w", ["job_done"])
        updated = await svc.update_config(cfg.id, name="renamed")
        assert updated is not None
        assert updated.name == "renamed"
        # Other fields unchanged
        assert updated.url == "https://d.com/w"
        assert updated.channel_type == "discord"

    async def test_update_multiple_fields(self, svc):
        cfg = await svc.add_config("orig", "discord", "https://d.com/w", ["job_done"], enabled=True)
        updated = await svc.update_config(
            cfg.id,
            channel_type="telegram",
            url="https://t.me/bot",
            events=["job_error", "batch_completed"],
            enabled=False,
            include_image=True,
        )
        assert updated is not None
        assert updated.channel_type == "telegram"
        assert updated.url == "https://t.me/bot"
        assert updated.events == ["job_error", "batch_completed"]
        assert updated.enabled is False
        assert updated.include_image is True

    async def test_update_nonexistent(self, svc):
        result = await svc.update_config("does_not_exist", name="nope")
        assert result is None

    async def test_update_strips_url_whitespace(self, svc):
        cfg = await svc.add_config("u", "generic", "https://x.com", ["job_done"])
        updated = await svc.update_config(cfg.id, url="  https://y.com  ")
        assert updated.url == "https://y.com"

    async def test_update_persists(self, svc, tmp_store):
        cfg = await svc.add_config("persist", "generic", "https://x.com", ["job_done"])
        await svc.update_config(cfg.id, name="updated_name")

        svc2 = WebhookService(store=tmp_store)
        await svc2.load()
        configs = svc2.list_configs()
        assert configs[0]["name"] == "updated_name"


# ---------------------------------------------------------------------------
# delete_config
# ---------------------------------------------------------------------------


class TestDeleteConfig:
    async def test_delete_existing(self, svc):
        cfg = await svc.add_config("delme", "discord", "https://d.com/w", ["job_done"])
        result = await svc.delete_config(cfg.id)
        assert result is True
        assert svc.list_configs() == []

    async def test_delete_nonexistent(self, svc):
        result = await svc.delete_config("nonexistent_id")
        assert result is False

    async def test_delete_one_of_many(self, svc):
        c1 = await svc.add_config("keep", "discord", "https://d.com/1", ["job_done"])
        c2 = await svc.add_config("remove", "telegram", "123456:ABC", ["job_error"])
        result = await svc.delete_config(c2.id)
        assert result is True
        remaining = svc.list_configs()
        assert len(remaining) == 1
        assert remaining[0]["id"] == c1.id

    async def test_delete_persists(self, svc, tmp_store):
        cfg = await svc.add_config("gone", "generic", "https://x.com", ["job_done"])
        await svc.delete_config(cfg.id)

        svc2 = WebhookService(store=tmp_store)
        await svc2.load()
        assert svc2.list_configs() == []


# ---------------------------------------------------------------------------
# list_configs
# ---------------------------------------------------------------------------


class TestListConfigs:
    async def test_empty(self, svc):
        assert svc.list_configs() == []

    async def test_returns_dicts(self, svc):
        await svc.add_config("dc", "discord", "https://d.com/w", ["job_done"])
        listed = svc.list_configs()
        assert len(listed) == 1
        item = listed[0]
        # Must be plain dicts, not WebhookConfig dataclass
        assert isinstance(item, dict)
        assert "id" in item
        assert "name" in item
        assert "channel_type" in item
        assert "url" in item
        assert "events" in item
        assert "enabled" in item
        assert "include_image" in item


# ---------------------------------------------------------------------------
# notify – disabled config
# ---------------------------------------------------------------------------


class TestNotify:
    async def test_disabled_config_no_http(self, svc):
        """A disabled config must not trigger _http_post."""
        await svc.add_config(
            "disabled", "discord", "https://d.com/w",
            ["job_done"], enabled=False,
        )
        svc._http_post = AsyncMock()
        await svc.notify("job_done", job={"filename": "test.png"})
        svc._http_post.assert_not_called()

    async def test_event_not_in_config_events(self, svc):
        """Config subscribing to 'job_error' should not be notified for 'job_done'."""
        await svc.add_config(
            "err-only", "discord", "https://d.com/w",
            ["job_error"], enabled=True,
        )
        svc._http_post = AsyncMock()
        await svc.notify("job_done", job={"filename": "test.png"})
        svc._http_post.assert_not_called()

    async def test_notify_sends_to_matching_enabled_config(self, svc):
        """An enabled config whose events include the triggered event should receive a call."""
        await svc.add_config(
            "active", "generic", "https://example.com/hook",
            ["job_done"], enabled=True,
        )
        svc._http_post = AsyncMock()
        await svc.notify("job_done", job={"filename": "test.png"})
        svc._http_post.assert_called_once()
        call_args = svc._http_post.call_args
        # First positional arg should be the URL
        assert call_args[0][0] == "https://example.com/hook"

    async def test_notify_multiple_configs(self, svc):
        """Multiple matching configs all receive notifications."""
        await svc.add_config("c1", "generic", "https://a.com/h", ["job_done"])
        await svc.add_config("c2", "generic", "https://b.com/h", ["job_done"])
        await svc.add_config(
            "c3", "generic", "https://c.com/h",
            ["job_error"],  # different event
        )
        svc._http_post = AsyncMock()
        await svc.notify("job_done", job={"filename": "test.png"})
        assert svc._http_post.call_count == 2

    async def test_notify_discord_job_done(self, svc):
        """Discord job_done builds correct embed payload."""
        await svc.add_config(
            "dc", "discord", "https://discord.com/wh",
            ["job_done"], enabled=True,
        )
        svc._http_post = AsyncMock()
        job = {
            "filename": "image.png",
            "prompt": "a cat",
            "executionDurationMs": 5000,
        }
        await svc.notify("job_done", job=job)
        svc._http_post.assert_called_once()
        payload = svc._http_post.call_args[0][1]
        assert payload["embeds"][0]["title"] == "🎨 이미지 생성 완료"

    async def test_notify_discord_job_error(self, svc):
        """Discord job_error builds correct error embed."""
        await svc.add_config(
            "dc", "discord", "https://discord.com/wh",
            ["job_error"], enabled=True,
        )
        svc._http_post = AsyncMock()
        job = {"filename": "fail.png", "error": "OOM", "retryCount": 3}
        await svc.notify("job_error", job=job)
        svc._http_post.assert_called_once()
        payload = svc._http_post.call_args[0][1]
        assert payload["embeds"][0]["title"] == "❌ 이미지 생성 실패"

    async def test_notify_telegram_job_done(self, svc):
        """Telegram job_done sends correct params."""
        await svc.add_config(
            "tg", "telegram", "123456:TOKEN",
            ["job_done"], enabled=True,
        )
        svc._http_post = AsyncMock()
        job = {"filename": "img.png", "prompt": "dog", "executionDurationMs": 3000}
        await svc.notify("job_done", job=job)
        svc._http_post.assert_called_once()
        call_url = svc._http_post.call_args[0][0]
        assert "/sendMessage" in call_url
        payload = svc._http_post.call_args[0][1]
        assert "이미지 생성 완료" in payload["text"]

    async def test_notify_generic_batch_completed(self, svc):
        """Generic webhook receives batch info."""
        await svc.add_config(
            "gen", "generic", "https://example.com/wh",
            ["batch_completed"], enabled=True,
        )
        svc._http_post = AsyncMock()
        batch_info = {"done": 5, "error": 1, "total": 6}
        await svc.notify("batch_completed", batch_info=batch_info)
        svc._http_post.assert_called_once()
        payload = svc._http_post.call_args[0][1]
        assert payload["event"] == "batch_completed"
        assert payload["batch"] == batch_info

    async def test_notify_telegram_http_url(self, svc):
        """Telegram config with full HTTP URL uses it directly."""
        await svc.add_config(
            "tg", "telegram",
            "https://api.telegram.org/botTOKEN/sendMessage",
            ["job_done"], enabled=True,
        )
        svc._http_post = AsyncMock()
        await svc.notify("job_done", job={"filename": "f.png"})
        call_url = svc._http_post.call_args[0][0]
        assert call_url == "https://api.telegram.org/botTOKEN/sendMessage"

    async def test_notify_discord_batch_completed(self, svc):
        """Discord batch_completed sends correct embed."""
        await svc.add_config(
            "dc", "discord", "https://discord.com/wh",
            ["batch_completed"], enabled=True,
        )
        svc._http_post = AsyncMock()
        batch_info = {"done": 10, "error": 2, "total": 12}
        await svc.notify("batch_completed", batch_info=batch_info)
        svc._http_post.assert_called_once()
        payload = svc._http_post.call_args[0][1]
        assert "배치 완료" in payload["embeds"][0]["title"]
        assert payload["embeds"][0]["color"] == 0xF59E0B  # has errors → amber

    async def test_notify_no_job_no_crash(self, svc):
        """notify with job=None for job_done should not crash (discord _discord_job returns early)."""
        await svc.add_config(
            "dc", "discord", "https://discord.com/wh",
            ["job_done"], enabled=True,
        )
        svc._http_post = AsyncMock()
        await svc.notify("job_done", job=None)
        # _discord_job returns early when job is None, so no HTTP call
        svc._http_post.assert_not_called()

    async def test_notify_no_batch_info_no_crash(self, svc):
        """notify with batch_info=None for batch_completed should not crash."""
        await svc.add_config(
            "dc", "discord", "https://discord.com/wh",
            ["batch_completed"], enabled=True,
        )
        svc._http_post = AsyncMock()
        await svc.notify("batch_completed", batch_info=None)
        # _discord_batch returns early when batch_info is None
        svc._http_post.assert_not_called()