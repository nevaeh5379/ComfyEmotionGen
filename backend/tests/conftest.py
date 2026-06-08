"""
공용 pytest fixture.
- tmp_store: 임시 SQLite DB를 사용하는 JobStore 인스턴스
"""
from __future__ import annotations

from pathlib import Path

import pytest_asyncio

from backend.src.job_store import JobStore


@pytest_asyncio.fixture
async def tmp_store(tmp_path: Path) -> JobStore:
    """임시 DB 경로를 사용하는 JobStore. 테스트结束后 자동 close."""
    store = JobStore(db_path=tmp_path / "test.db")
    await store.open()
    try:
        yield store
    finally:
        await store.close()