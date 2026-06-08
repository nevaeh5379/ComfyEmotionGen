"""Unit tests for backend/src/_version.py."""

import os
import importlib
import re

import pytest


@pytest.fixture(autouse=True)
def _reset_version_module(monkeypatch):
    """Remove relevant env vars and re-import the module before each test."""
    monkeypatch.delenv("CEG_BUNDLE_VERSION", raising=False)
    monkeypatch.delenv("CEG_COMMIT", raising=False)
    import backend.src._version as mod

    importlib.reload(mod)
    yield
    importlib.reload(mod)  # restore original state after test


def _import_version():
    """Helper to re-import and return the version module."""
    import backend.src._version as mod

    importlib.reload(mod)
    return mod


def test_backend_version_is_valid_semver():
    """BACKEND_VERSION should be a valid semver string (x.y.z format)."""
    mod = _import_version()
    assert re.match(r"^\d+\.\d+\.\d+$", mod.BACKEND_VERSION), (
        f"BACKEND_VERSION '{mod.BACKEND_VERSION}' is not a valid x.y.z semver string"
    )


def test_bundle_version_default_is_dev():
    """BUNDLE_VERSION defaults to 'dev' when CEG_BUNDLE_VERSION is not set."""
    mod = _import_version()
    assert mod.BUNDLE_VERSION == "dev"


def test_bundle_version_reads_from_env(monkeypatch):
    """BUNDLE_VERSION reads its value from the CEG_BUNDLE_VERSION env var."""
    monkeypatch.setenv("CEG_BUNDLE_VERSION", "2024.01")
    mod = _import_version()
    assert mod.BUNDLE_VERSION == "2024.01"


def test_commit_default_is_none():
    """COMMIT defaults to None when CEG_COMMIT is not set."""
    mod = _import_version()
    assert mod.COMMIT is None


def test_commit_reads_from_env(monkeypatch):
    """COMMIT reads its value from the CEG_COMMIT env var."""
    monkeypatch.setenv("CEG_COMMIT", "abc1234")
    mod = _import_version()
    assert mod.COMMIT == "abc1234"