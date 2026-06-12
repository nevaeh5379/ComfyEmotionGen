"""
Tests for Settings and Webhooks API endpoints:

Settings (prefix /app-settings):
  GET    /app-settings          — list all settings
  GET    /app-settings/{key}    — get a single setting
  PUT    /app-settings/{key}    — create or update a setting
  DELETE /app-settings/{key}    — delete a setting

Webhooks (prefix /webhooks):
  GET    /webhooks                 — list webhook configs
  POST   /webhooks                 — create webhook config
  PUT    /webhooks/{config_id}     — update webhook config
  DELETE /webhooks/{config_id}     — delete webhook config
  POST   /webhooks/{config_id}/test — send test webhook
"""
from __future__ import annotations

import pytest_asyncio


def _get_store():
    """Access the JobStore from the live app's job_manager."""
    from backend.src.server import job_manager
    return job_manager._store


def _get_webhook_service():
    """Access the (mocked) WebhookService from the live app."""
    from backend.src.server import webhook_service
    return webhook_service


# ═══════════════════════════════════════════════════════════════
#  App Settings
# ═══════════════════════════════════════════════════════════════


class TestAppSettingsList:
    """GET /app-settings — list all settings."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await self.store.save_setting("test_key_a", "value_a")
        await self.store.save_setting("test_key_b", "value_b")

    def test_list_returns_dict(self, client):
        resp = client.get("/app-settings")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_list_contains_seeded_settings(self, client):
        resp = client.get("/app-settings")
        body = resp.json()
        assert body.get("test_key_a") == "value_a"
        assert body.get("test_key_b") == "value_b"

    def test_list_empty_when_no_settings(self, client):
        # Delete the seeded settings
        client.delete("/app-settings/test_key_a")
        client.delete("/app-settings/test_key_b")
        resp = client.get("/app-settings")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)
        # The dict may still contain other keys from other tests since
        # the DB is shared, but our specific keys should be gone.
        assert "test_key_a" not in body


class TestAppSettingsGet:
    """GET /app-settings/{key} — get a single setting."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await self.store.save_setting("theme", "dark")

    def test_get_existing_setting(self, client):
        resp = client.get("/app-settings/theme")
        assert resp.status_code == 200
        body = resp.json()
        assert body["key"] == "theme"
        assert body["value"] == "dark"

    def test_get_nonexistent_setting_returns_404(self, client):
        resp = client.get("/app-settings/does_not_exist")
        assert resp.status_code == 404


class TestAppSettingsSet:
    """PUT /app-settings/{key} — create or update a setting."""

    def test_create_new_setting(self, client):
        resp = client.put("/app-settings/language_new", json={"value": "ko"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True

        # Verify it was persisted
        get_resp = client.get("/app-settings/language_new")
        assert get_resp.status_code == 200
        assert get_resp.json()["value"] == "ko"

    def test_update_existing_setting(self, client):
        # Create first via PUT
        client.put("/app-settings/lang_update", json={"value": "en"})

        # Update it
        resp = client.put("/app-settings/lang_update", json={"value": "ko"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify it was updated
        get_resp = client.get("/app-settings/lang_update")
        assert get_resp.json()["value"] == "ko"

    def test_set_setting_with_empty_value(self, client):
        resp = client.put("/app-settings/empty_key_test", json={"value": ""})
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True

        get_resp = client.get("/app-settings/empty_key_test")
        assert get_resp.status_code == 200
        assert get_resp.json()["value"] == ""

    def test_set_setting_value_with_json_string(self, client):
        """Values can be JSON-encoded strings for complex config."""
        json_value = '{"nested": true, "count": 5}'
        resp = client.put("/app-settings/complex_test", json={"value": json_value})
        assert resp.status_code == 200

        get_resp = client.get("/app-settings/complex_test")
        assert get_resp.json()["value"] == json_value

    def test_set_missing_value_field_returns_422(self, client):
        resp = client.put("/app-settings/bad_key_test", json={"not_value": "x"})
        assert resp.status_code == 422


class TestAppSettingsDelete:
    """DELETE /app-settings/{key} — delete a setting."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        self.store = _get_store()
        await self.store.save_setting("to_delete_key", "gone_soon")

    def test_delete_existing_setting(self, client):
        resp = client.delete("/app-settings/to_delete_key")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True

        # Verify it's gone
        get_resp = client.get("/app-settings/to_delete_key")
        assert get_resp.status_code == 404

    def test_delete_nonexistent_setting_still_returns_ok(self, client):
        """Server returns {ok: true} from delete even if key didn't exist."""
        resp = client.delete("/app-settings/nonexistent_key_xyz")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_then_recreate(self, client):
        client.delete("/app-settings/to_delete_key")

        # Re-create it
        resp = client.put("/app-settings/to_delete_key", json={"value": "restored"})
        assert resp.status_code == 200

        get_resp = client.get("/app-settings/to_delete_key")
        assert get_resp.status_code == 200
        assert get_resp.json()["value"] == "restored"


# ═══════════════════════════════════════════════════════════════
#  Webhooks
# ═══════════════════════════════════════════════════════════════


def _clear_webhook_configs():
    """Remove all webhook configs from the mocked service."""
    ws = _get_webhook_service()
    ws._configs.clear()


class TestWebhooksList:
    """GET /webhooks — list webhook configs."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        _clear_webhook_configs()

    def test_list_returns_empty_initially(self, client):
        resp = client.get("/webhooks")
        assert resp.status_code == 200
        body = resp.json()
        assert "configs" in body
        assert isinstance(body["configs"], list)

    def test_list_returns_created_configs(self, client):
        create_resp = client.post("/webhooks", json={
            "name": "My Discord Hook",
            "channel_type": "discord",
            "url": "https://discord.com/webhook/test",
            "events": ["job_done"],
            "enabled": True,
            "include_image": False,
        })
        assert create_resp.status_code == 200

        list_resp = client.get("/webhooks")
        assert list_resp.status_code == 200
        configs = list_resp.json()["configs"]
        assert len(configs) == 1
        found = configs[0]
        assert found["name"] == "My Discord Hook"
        assert found["channel_type"] == "discord"
        assert found["url"] == "https://discord.com/webhook/test"
        assert found["events"] == ["job_done"]
        assert found["enabled"] is True
        assert found["include_image"] is False


class TestWebhooksCreate:
    """POST /webhooks — create webhook config."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        _clear_webhook_configs()

    def test_create_discord_webhook(self, client):
        resp = client.post("/webhooks", json={
            "name": "Discord Alert",
            "channel_type": "discord",
            "url": "https://discord.com/api/webhooks/123",
            "events": ["job_done", "job_error"],
            "enabled": True,
            "include_image": True,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "config" in body
        cfg = body["config"]
        assert cfg["name"] == "Discord Alert"
        assert cfg["channel_type"] == "discord"
        assert cfg["url"] == "https://discord.com/api/webhooks/123"
        assert "job_done" in cfg["events"]
        assert "job_error" in cfg["events"]
        assert cfg["enabled"] is True
        assert cfg["include_image"] is True
        assert "id" in cfg

    def test_create_telegram_webhook(self, client):
        resp = client.post("/webhooks", json={
            "name": "TG Bot",
            "channel_type": "telegram",
            "url": "https://api.telegram.org/bot123/sendMessage",
            "events": ["job_done"],
            "enabled": True,
            "include_image": False,
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["channel_type"] == "telegram"

    def test_create_generic_webhook(self, client):
        resp = client.post("/webhooks", json={
            "name": "Custom Hook",
            "channel_type": "generic",
            "url": "https://example.com/hook",
            "events": ["batch_completed"],
            "enabled": False,
            "include_image": True,
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["channel_type"] == "generic"
        assert cfg["enabled"] is False
        assert cfg["include_image"] is True

    def test_create_webhook_defaults(self, client):
        """Default values for events, enabled, and include_image."""
        resp = client.post("/webhooks", json={
            "name": "Minimal Hook",
            "channel_type": "discord",
            "url": "https://discord.com/min",
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["name"] == "Minimal Hook"
        assert cfg["enabled"] is True
        assert cfg["include_image"] is False
        assert isinstance(cfg["events"], list)
        assert len(cfg["events"]) > 0  # defaults to WEBHOOK_EVENTS

    def test_create_webhook_invalid_channel_type_returns_422(self, client):
        resp = client.post("/webhooks", json={
            "name": "Bad Type",
            "channel_type": "slack",
            "url": "https://slack.com/hook",
            "events": ["job_done"],
        })
        assert resp.status_code == 422

    def test_create_webhook_missing_required_fields_returns_422(self, client):
        resp = client.post("/webhooks", json={})
        assert resp.status_code == 422

    def test_create_webhook_missing_name_returns_422(self, client):
        resp = client.post("/webhooks", json={
            "channel_type": "discord",
            "url": "https://discord.com/hook",
        })
        assert resp.status_code == 422

    def test_create_webhook_missing_url_returns_422(self, client):
        resp = client.post("/webhooks", json={
            "name": "No URL",
            "channel_type": "discord",
        })
        assert resp.status_code == 422

    def test_create_multiple_webhooks(self, client):
        resp1 = client.post("/webhooks", json={
            "name": "Hook A",
            "channel_type": "discord",
            "url": "https://discord.com/a",
        })
        assert resp1.status_code == 200

        resp2 = client.post("/webhooks", json={
            "name": "Hook B",
            "channel_type": "telegram",
            "url": "https://api.telegram.org/b",
        })
        assert resp2.status_code == 200

        list_resp = client.get("/webhooks")
        configs = list_resp.json()["configs"]
        assert len(configs) == 2
        names = [c["name"] for c in configs]
        assert "Hook A" in names
        assert "Hook B" in names

    def test_create_returns_unique_id(self, client):
        resp1 = client.post("/webhooks", json={
            "name": "First",
            "channel_type": "discord",
            "url": "https://discord.com/1",
        })
        resp2 = client.post("/webhooks", json={
            "name": "Second",
            "channel_type": "telegram",
            "url": "https://api.telegram.org/2",
        })
        id1 = resp1.json()["config"]["id"]
        id2 = resp2.json()["config"]["id"]
        assert id1 != id2


class TestWebhooksUpdate:
    """PUT /webhooks/{config_id} — update webhook config."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        _clear_webhook_configs()
        self.create_resp = client.post("/webhooks", json={
            "name": "Original Hook",
            "channel_type": "discord",
            "url": "https://discord.com/original",
            "events": ["job_done"],
            "enabled": True,
            "include_image": False,
        })
        self.config_id = self.create_resp.json()["config"]["id"]

    def test_update_name(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "name": "Renamed Hook",
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["name"] == "Renamed Hook"
        assert cfg["channel_type"] == "discord"  # unchanged

    def test_update_url(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "url": "https://discord.com/updated",
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["url"] == "https://discord.com/updated"
        assert cfg["name"] == "Original Hook"  # unchanged

    def test_update_enabled(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "enabled": False,
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["enabled"] is False

    def test_update_include_image(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "include_image": True,
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["include_image"] is True

    def test_update_events(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "events": ["job_done", "job_error", "batch_completed"],
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert "job_done" in cfg["events"]
        assert "job_error" in cfg["events"]
        assert "batch_completed" in cfg["events"]

    def test_update_channel_type(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "channel_type": "telegram",
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["channel_type"] == "telegram"

    def test_update_multiple_fields_at_once(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "name": "Multi Update",
            "url": "https://example.com/new",
            "enabled": False,
            "include_image": True,
            "events": ["batch_completed"],
            "channel_type": "generic",
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["name"] == "Multi Update"
        assert cfg["url"] == "https://example.com/new"
        assert cfg["enabled"] is False
        assert cfg["include_image"] is True
        assert cfg["events"] == ["batch_completed"]
        assert cfg["channel_type"] == "generic"

    def test_update_nonexistent_config_returns_404(self, client):
        resp = client.put("/webhooks/nonexistent_id_99999", json={
            "name": "Ghost",
        })
        assert resp.status_code == 404

    def test_update_preserves_config_id(self, client):
        resp = client.put(f"/webhooks/{self.config_id}", json={
            "name": "Still Same",
        })
        assert resp.status_code == 200
        cfg = resp.json()["config"]
        assert cfg["id"] == self.config_id


class TestWebhooksDelete:
    """DELETE /webhooks/{config_id} — delete webhook config."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        _clear_webhook_configs()

    def test_delete_existing_config(self, client):
        create_resp = client.post("/webhooks", json={
            "name": "To Delete",
            "channel_type": "discord",
            "url": "https://discord.com/delete",
        })
        config_id = create_resp.json()["config"]["id"]

        del_resp = client.delete(f"/webhooks/{config_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True

        # Verify it's gone from the list
        list_resp = client.get("/webhooks")
        ids = [c["id"] for c in list_resp.json()["configs"]]
        assert config_id not in ids

    def test_delete_nonexistent_config_returns_404(self, client):
        resp = client.delete("/webhooks/nonexistent_id_99999")
        assert resp.status_code == 404

    def test_delete_twice_returns_404_on_second(self, client):
        create_resp = client.post("/webhooks", json={
            "name": "Double Delete",
            "channel_type": "generic",
            "url": "https://example.com/dd",
        })
        config_id = create_resp.json()["config"]["id"]

        del1 = client.delete(f"/webhooks/{config_id}")
        assert del1.status_code == 200

        del2 = client.delete(f"/webhooks/{config_id}")
        assert del2.status_code == 404

    def test_delete_does_not_affect_other_configs(self, client):
        resp_a = client.post("/webhooks", json={
            "name": "Hook A",
            "channel_type": "discord",
            "url": "https://discord.com/a",
        })
        resp_b = client.post("/webhooks", json={
            "name": "Hook B",
            "channel_type": "telegram",
            "url": "https://api.telegram.org/b",
        })
        id_a = resp_a.json()["config"]["id"]
        id_b = resp_b.json()["config"]["id"]

        client.delete(f"/webhooks/{id_a}")

        list_resp = client.get("/webhooks")
        configs = list_resp.json()["configs"]
        ids = [c["id"] for c in configs]
        assert id_a not in ids
        assert id_b in ids


class TestWebhooksTest:
    """POST /webhooks/{config_id}/test — send test webhook."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self, client):
        _clear_webhook_configs()

    def test_send_test_webhook(self, client):
        create_resp = client.post("/webhooks", json={
            "name": "Testable Hook",
            "channel_type": "discord",
            "url": "https://discord.com/test",
        })
        config_id = create_resp.json()["config"]["id"]

        test_resp = client.post(f"/webhooks/{config_id}/test")
        # The WebhookService is mocked so it just returns success
        assert test_resp.status_code == 200
        assert test_resp.json()["ok"] is True

    def test_test_nonexistent_config_returns_404(self, client):
        resp = client.post("/webhooks/nonexistent_id_99999/test")
        assert resp.status_code == 404