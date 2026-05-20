"""
웹훅 알림 서비스.

지원 채널: Discord, Telegram, Generic Webhook.
트리거 이벤트: job.done, job.error, batch.completed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

import aiohttp

logger = logging.getLogger(__name__)

ChannelType = Literal["discord", "telegram", "generic"]

WEBHOOK_EVENTS = ["job_done", "job_error", "batch_completed"]


@dataclass
class WebhookConfig:
    id: str
    name: str
    channel_type: ChannelType
    url: str
    events: list[str]
    enabled: bool
    include_image: bool = False


def _new_config_id() -> str:
    return uuid.uuid4().hex[:12]


class WebhookService:
    """웹훅 설정 관리 + 알림 전송."""

    def __init__(self, store: Any) -> None:  # JobStore
        self._store = store
        self._configs: list[WebhookConfig] = []

    async def load(self) -> None:
        raw = await self._store.get_setting("webhook_configs")
        if raw:
            try:
                data = json.loads(raw)
                self._configs = [
                    WebhookConfig(
                        id=c["id"],
                        name=c["name"],
                        channel_type=c["channel_type"],
                        url=c["url"],
                        events=c.get("events", WEBHOOK_EVENTS),
                        enabled=c.get("enabled", True),
                        include_image=c.get("include_image", False),
                    )
                    for c in data
                ]
            except (json.JSONDecodeError, KeyError, TypeError):
                self._configs = []
        else:
            self._configs = []

    async def save(self) -> None:
        data = [
            {
                "id": c.id,
                "name": c.name,
                "channel_type": c.channel_type,
                "url": c.url,
                "events": c.events,
                "enabled": c.enabled,
                "include_image": c.include_image,
            }
            for c in self._configs
        ]
        await self._store.save_setting("webhook_configs", json.dumps(data, ensure_ascii=False))

    # ── CRUD ──

    def list_configs(self) -> list[dict[str, Any]]:
        return [
            {
                "id": c.id,
                "name": c.name,
                "channel_type": c.channel_type,
                "url": c.url,
                "events": c.events,
                "enabled": c.enabled,
                "include_image": c.include_image,
            }
            for c in self._configs
        ]

    async def add_config(
        self,
        name: str,
        channel_type: ChannelType,
        url: str,
        events: list[str],
        enabled: bool = True,
        include_image: bool = False,
    ) -> WebhookConfig:
        cfg = WebhookConfig(
            id=_new_config_id(),
            name=name,
            channel_type=channel_type,
            url=url.strip(),
            events=events,
            enabled=enabled,
            include_image=include_image,
        )
        self._configs.append(cfg)
        await self.save()
        return cfg

    async def update_config(
        self,
        config_id: str,
        name: Optional[str] = None,
        channel_type: Optional[ChannelType] = None,
        url: Optional[str] = None,
        events: Optional[list[str]] = None,
        enabled: Optional[bool] = None,
        include_image: Optional[bool] = None,
    ) -> Optional[WebhookConfig]:
        for cfg in self._configs:
            if cfg.id == config_id:
                if name is not None:
                    cfg.name = name
                if channel_type is not None:
                    cfg.channel_type = channel_type
                if url is not None:
                    cfg.url = url.strip()
                if events is not None:
                    cfg.events = events
                if enabled is not None:
                    cfg.enabled = enabled
                if include_image is not None:
                    cfg.include_image = include_image
                await self.save()
                return cfg
        return None

    async def delete_config(self, config_id: str) -> bool:
        before = len(self._configs)
        self._configs = [c for c in self._configs if c.id != config_id]
        if len(self._configs) < before:
            await self.save()
            return True
        return False

    # ── 알림 전송 ──

    async def notify(
        self,
        event: str,
        job: Optional[dict[str, Any]] = None,
        batch_info: Optional[dict[str, Any]] = None,
    ) -> None:
        """웹훅 이벤트 전송 (비동기, 실패해도 메인 흐름 영향 없음)."""
        tasks = []
        for cfg in self._configs:
            if not cfg.enabled:
                continue
            if event not in cfg.events:
                continue
            tasks.append(self._send(cfg, event, job, batch_info))
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, Exception):
                    logger.warning("webhook send failed: %s", r)

    async def _send(
        self,
        cfg: WebhookConfig,
        event: str,
        job: Optional[dict[str, Any]],
        batch_info: Optional[dict[str, Any]],
    ) -> None:
        try:
            if cfg.channel_type == "discord":
                await self._send_discord(cfg, event, job, batch_info)
            elif cfg.channel_type == "telegram":
                await self._send_telegram(cfg, event, job, batch_info)
            elif cfg.channel_type == "generic":
                await self._send_generic(cfg, event, job, batch_info)
        except asyncio.TimeoutError:
            logger.warning("webhook timeout: %s (%s)", cfg.name, cfg.channel_type)
        except Exception:
            logger.exception("webhook send error: %s", cfg.name)

    # ── Discord ──

    async def _send_discord(
        self,
        cfg: WebhookConfig,
        event: str,
        job: Optional[dict[str, Any]],
        batch_info: Optional[dict[str, Any]],
    ) -> None:
        if event == "batch_completed":
            await self._discord_batch(cfg, batch_info)
        else:
            await self._discord_job(cfg, event, job)

    async def _discord_job(
        self,
        cfg: WebhookConfig,
        event: str,
        job: Optional[dict[str, Any]],
    ) -> None:
        if not job:
            return
        filename = job.get("filename", "unknown")
        prompt = job.get("prompt", "")
        duration = job.get("executionDurationMs")
        duration_str = f"{duration / 1000:.1f}초" if duration else "—"

        if event == "job_done":
            title = "🎨 이미지 생성 완료"
            color = 0x10B981
            fields = [
                {"name": "파일명", "value": filename, "inline": True},
                {"name": "소요시간", "value": duration_str, "inline": True},
            ]
            if prompt:
                fields.append({"name": "프롬프트", "value": prompt[:1000], "inline": False})
        else:
            error = job.get("error", "unknown error")
            retry = job.get("retryCount", 0)
            title = "❌ 이미지 생성 실패"
            color = 0xEF4444
            fields = [
                {"name": "파일명", "value": filename, "inline": True},
                {"name": "재시도", "value": f"{retry}회", "inline": True},
                {"name": "에러", "value": str(error)[:1000], "inline": False},
            ]

        payload = {
            "embeds": [
                {
                    "title": title,
                    "color": color,
                    "fields": fields,
                    "timestamp": _iso_now(),
                }
            ],
        }

        if cfg.include_image and event == "job_done":
            image_hashes = job.get("savedImageHashes", [])
            if image_hashes:
                payload["embeds"][0]["image"] = {
                    "url": f"/saved-images/{image_hashes[0]}"
                }

        await self._http_post(cfg.url, payload, timeout=10)

    async def _discord_batch(
        self,
        cfg: WebhookConfig,
        batch_info: Optional[dict[str, Any]],
    ) -> None:
        if not batch_info:
            return
        done = batch_info.get("done", 0)
        error = batch_info.get("error", 0)
        total = batch_info.get("total", 0)

        if error > 0:
            title = f"✅ 배치 완료! ({done} 완료, {error} 실패)"
            color = 0xF59E0B
        else:
            title = f"✅ 배치 완료! ({done} 완료)"
            color = 0x10B981

        payload = {
            "embeds": [
                {
                    "title": title,
                    "color": color,
                    "fields": [
                        {"name": "총 작업", "value": str(total), "inline": True},
                        {"name": "완료", "value": str(done), "inline": True},
                    ],
                    "timestamp": _iso_now(),
                }
            ],
        }

        await self._http_post(cfg.url, payload, timeout=10)

    # ── Telegram ──

    async def _send_telegram(
        self,
        cfg: WebhookConfig,
        event: str,
        job: Optional[dict[str, Any]],
        batch_info: Optional[dict[str, Any]],
    ) -> None:
        if event == "batch_completed":
            await self._telegram_batch(cfg, batch_info)
        else:
            await self._telegram_job(cfg, event, job)

    async def _telegram_job(
        self,
        cfg: WebhookConfig,
        event: str,
        job: Optional[dict[str, Any]],
    ) -> None:
        if not job:
            return
        filename = job.get("filename", "unknown")
        prompt = job.get("prompt", "")
        duration = job.get("executionDurationMs")
        duration_str = f"{duration / 1000:.1f}초" if duration else "—"

        if event == "job_done":
            text = (
                f"<b>🎨 이미지 생성 완료</b>\n"
                f"파일명: <code>{_tg_escape(filename)}</code>\n"
                f"소요시간: {duration_str}"
            )
            if prompt:
                text += f"\n프롬프트: <code>{_tg_escape(prompt[:500])}</code>"
        else:
            error = job.get("error", "unknown error")
            retry = job.get("retryCount", 0)
            text = (
                f"<b>❌ 이미지 생성 실패</b>\n"
                f"파일명: <code>{_tg_escape(filename)}</code>\n"
                f"재시도: {retry}회\n"
                f"에러: <code>{_tg_escape(str(error)[:500])}</code>"
            )

        params = {
            "chat_id": cfg.url.split("/")[-1] if "/" in cfg.url else cfg.url,
            "text": text,
            "parse_mode": "HTML",
        }

        # Telegram API URL 형식: https://api.telegram.org/bot<TOKEN>/sendMessage
        # 사용자가 전체 URL을 입력하거나 토큰만 입력할 수 있음
        if cfg.url.startswith("http"):
            url = cfg.url.rstrip("/")
            if url.endswith("/sendMessage"):
                pass
            else:
                url += "/sendMessage"
        else:
            url = f"https://api.telegram.org/bot{cfg.url}/sendMessage"

        await self._http_post(url, params, timeout=10)

    async def _telegram_batch(
        self,
        cfg: WebhookConfig,
        batch_info: Optional[dict[str, Any]],
    ) -> None:
        if not batch_info:
            return
        done = batch_info.get("done", 0)
        error = batch_info.get("error", 0)
        total = batch_info.get("total", 0)

        if error > 0:
            text = f"<b>✅ 배치 완료!</b>\n완료: {done}, 실패: {error}, 총: {total}"
        else:
            text = f"<b>✅ 배치 완료!</b>\n완료: {done}, 총: {total}"

        params = {
            "chat_id": cfg.url.split("/")[-1] if "/" in cfg.url else cfg.url,
            "text": text,
            "parse_mode": "HTML",
        }

        if cfg.url.startswith("http"):
            url = cfg.url.rstrip("/")
            if url.endswith("/sendMessage"):
                pass
            else:
                url += "/sendMessage"
        else:
            url = f"https://api.telegram.org/bot{cfg.url}/sendMessage"

        await self._http_post(url, params, timeout=10)

    # ── Generic ──

    async def _send_generic(
        self,
        cfg: WebhookConfig,
        event: str,
        job: Optional[dict[str, Any]],
        batch_info: Optional[dict[str, Any]],
    ) -> None:
        payload = {
            "event": event,
            "timestamp": _iso_now(),
        }
        if job:
            payload["job"] = job
        if batch_info:
            payload["batch"] = batch_info

        await self._http_post(cfg.url, payload, timeout=10, is_json=True)

    # ── HTTP 유틸 ──

    async def _http_post(
        self,
        url: str,
        payload: dict[str, Any],
        timeout: int = 10,
        is_json: bool = False,
    ) -> None:
        async with aiohttp.ClientSession() as session:
            kwargs = {
                "timeout": aiohttp.ClientTimeout(total=timeout),
            }
            if is_json:
                kwargs["json"] = payload
            else:
                kwargs["data"] = payload

            async with session.post(url, **kwargs) as resp:
                if not resp.ok:
                    body = await resp.text()
                    logger.warning(
                        "webhook HTTP %d: %s — %s", resp.status, url, body[:200]
                    )


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _tg_escape(text: str) -> str:
    """Telegram HTML 모드에서 이스케이프해야 하는 문자 처리."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
