"""Backend package utilities."""

from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path


_LOGGING_CONFIGURED = False


def configure_logging() -> None:
    """Configure process-wide logging once.

    Environment variables:
        CEG_LOG_LEVEL: root log level, defaults to INFO.
        CEG_LOG_FILE: log file path, defaults to data/logs/backend.log.
        CEG_LOG_MAX_BYTES: rotating file size, defaults to 10 MiB.
        CEG_LOG_BACKUP_COUNT: number of rotated files, defaults to 5.
    """
    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    level_name = os.environ.get("CEG_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_file = Path(os.environ.get("CEG_LOG_FILE", "data/logs/backend.log"))
    max_bytes = _env_int("CEG_LOG_MAX_BYTES", 10 * 1024 * 1024)
    backup_count = _env_int("CEG_LOG_BACKUP_COUNT", 5)

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(level)

    if not any(getattr(handler, "_ceg_console", False) for handler in root.handlers):
        console_handler = logging.StreamHandler(sys.stderr)
        console_handler.setFormatter(formatter)
        console_handler.setLevel(level)
        console_handler._ceg_console = True  # type: ignore[attr-defined]
        root.addHandler(console_handler)

    if not any(getattr(handler, "_ceg_file", None) == str(log_file) for handler in root.handlers):
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(level)
        file_handler._ceg_file = str(log_file)  # type: ignore[attr-defined]
        root.addHandler(file_handler)

    _LOGGING_CONFIGURED = True
    logging.getLogger(__name__).info(
        "logging configured: level=%s file=%s maxBytes=%s backupCount=%s",
        logging.getLevelName(level),
        log_file,
        max_bytes,
        backup_count,
    )


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        logging.getLogger(__name__).warning(
            "invalid %s=%r; using default %s", name, value, default
        )
        return default
