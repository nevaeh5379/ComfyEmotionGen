"""
API 테스트용 pytest fixture.
Mock WorkerPool/ComfyWorker를 주입하여 실제 WS 연결을 방지합니다.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path):
    """
    격리된 DB + mock WorkerPool로 FastAPI TestClient 생성.
    먼저 모듈을 임포트한 후 mock합니다 (순환 임포트는 models.py 분리로 해결됨).
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

    # mock_pool 인스턴스를 미리 생성
    mock_pool_instance = AsyncMock()
    mock_pool_instance.all.return_value = []
    mock_pool_instance.info.return_value = []
    mock_pool_instance.start = AsyncMock()
    mock_pool_instance.stop = AsyncMock()

    # WorkerPool 생성자를 mock (lifespan에서 new WorkerPool(urls=...) 호출 대체)
    with patch("backend.src.worker_pool.WorkerPool", return_value=mock_pool_instance):
        # WebhookService.load()도 mock
        with patch("backend.src.webhook.WebhookService") as MockWS:
            mock_ws_instance = AsyncMock()
            MockWS.return_value = mock_ws_instance

            from backend.src.server import app

            with TestClient(app) as c:
                yield c

    # 환경변수 복원
    for k, v in old_env.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v