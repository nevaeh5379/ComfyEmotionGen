"""
API 테스트용 pytest fixture.
Mock WorkerPool/ComfyWorker를 주입하여 실제 WS 연결을 방지합니다.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path):
    """
    격리된 DB + mock WorkerPool로 FastAPI TestClient 생성.
    WorkerPool의 동기/비동기 메서드를 올바르게 mock합니다.
    """
    db_path = tmp_path / "test_api.db"
    images_dir = tmp_path / "images"
    images_dir.mkdir()

    # 환경변수 설정
    old_env = {}
    env_vars = {
        "CEG_DATABASE_PATH": str(db_path),
        "CEG_IMAGES_DIR": str(images_dir),
    }
    for k, v in env_vars.items():
        old_env[k] = os.environ.get(k)
        os.environ[k] = v

    # Mock WorkerPool 인스턴스 생성
    # WorkerPool.all() / info() 는 동기 메서드 → MagicMock
    # WorkerPool.start() / stop() 은 비동기 → AsyncMock
    mock_pool = MagicMock()
    mock_pool.all.return_value = []  # 동기 메서드
    mock_pool.info.return_value = []  # 동기 메서드
    mock_pool.start = AsyncMock()  # 비동기 메서드
    mock_pool.stop = AsyncMock()  # 비동기 메서드
    mock_pool.add = AsyncMock()  # 비동기 메서드
    mock_pool.remove = AsyncMock()  # 비동기 메서드
    mock_pool.has_url.return_value = False  # 동기 메서드
    mock_pool.get.return_value = None  # 동기 메서드
    mock_pool.find_idle.return_value = None  # 동기 메서드
    mock_pool.set_handlers = MagicMock()  # 동기 메서드

    # Mock WebhookService
    mock_ws = AsyncMock()
    mock_ws.load = AsyncMock()
    mock_ws.notify = AsyncMock()

    # WebhookService CRUD mock — backed by an in-memory list.
    # The server route handlers access .id / .name / .channel_type / .url /
    # .events / .enabled / .include_image on the returned objects, and also
    # iterate webhook_service._configs directly for the test endpoint.
    from types import SimpleNamespace
    _ws_counter = [0]

    def _ws_id():
        _ws_counter[0] += 1
        return f"mock-cfg-{_ws_counter[0]}"

    # In-memory store of SimpleNamespace config objects
    mock_ws._configs: list[SimpleNamespace] = []

    def _ws_list_configs():
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
            for c in mock_ws._configs
        ]

    async def _ws_add_config(**kwargs):
        cfg = SimpleNamespace(id=_ws_id(), **kwargs)
        mock_ws._configs.append(cfg)
        return cfg

    async def _ws_update_config(config_id, **kwargs):
        for cfg in mock_ws._configs:
            if cfg.id == config_id:
                for k, v in kwargs.items():
                    if v is not None:
                        setattr(cfg, k, v)
                return cfg
        return None

    async def _ws_delete_config(config_id):
        before = len(mock_ws._configs)
        mock_ws._configs[:] = [c for c in mock_ws._configs if c.id != config_id]
        return len(mock_ws._configs) < before

    mock_ws.list_configs = _ws_list_configs
    mock_ws.add_config = _ws_add_config
    mock_ws.update_config = _ws_update_config
    mock_ws.delete_config = _ws_delete_config

    with patch("backend.src.worker_pool.WorkerPool", return_value=mock_pool), \
         patch("backend.src.webhook.WebhookService", return_value=mock_ws):
        from backend.src.server import app

        with TestClient(app) as c:
            yield c

    # 환경변수 복원
    for k, v in old_env.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v