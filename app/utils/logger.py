"""Logging estruturado com mascaramento de segredos.

Uso::

    logger.info("Novo candle", extra=ctx(symbol="WINV26", time=ts))

Saída::

    2026-09-28 10:35:00,123 [INFO] app.data.candle_manager | Novo candle | symbol=WINV26 time=...

Segurança: ``SecretMaskingFilter`` é instalado nos *handlers* e substitui por
``***`` qualquer valor registrado via ``register_secret`` (senha, token, login,
chat id) e qualquer texto com formato de token do Telegram, antes da escrita.
"""

from __future__ import annotations

import logging
import re
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Iterable

MASK = "***"
# Formato de token de bot do Telegram: <id numérico>:<35 chars>
_TELEGRAM_TOKEN_RE = re.compile(r"(?<!\d)\d{6,}:[A-Za-z0-9_-]{30,}")
# Segredos com menos caracteres que isso não são mascarados por substring,
# para não destruir logs (ex.: um chat id "1" apareceria em todo número).
_MIN_SECRET_LEN = 4

_secrets: set[str] = set()
_lock = threading.Lock()


def register_secret(value: str | None) -> None:
    if value and len(value) >= _MIN_SECRET_LEN:
        with _lock:
            _secrets.add(value)


def register_secrets(values: Iterable[str | None]) -> None:
    for value in values:
        register_secret(value)


def clear_secrets() -> None:
    """Somente para testes."""
    with _lock:
        _secrets.clear()


def mask(text: str) -> str:
    with _lock:
        secrets = sorted(_secrets, key=len, reverse=True)
    for secret in secrets:
        text = text.replace(secret, MASK)
    return _TELEGRAM_TOKEN_RE.sub(MASK, text)


def ctx(**fields: Any) -> dict[str, Any]:
    """Atalho para passar contexto estruturado: ``extra=ctx(a=1)``."""
    return {"ctx": fields}


class SecretMaskingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = mask(record.getMessage())
        record.args = None
        context = getattr(record, "ctx", None)
        if isinstance(context, dict):
            record.ctx = {k: mask(str(v)) for k, v in context.items()}
        if record.exc_info and not record.exc_text:
            record.exc_text = logging.Formatter().formatException(record.exc_info)
        if record.exc_text:
            record.exc_text = mask(record.exc_text)
        return True


class StructuredFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__("%(asctime)s [%(levelname)s] %(name)s | %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        context = getattr(record, "ctx", None)
        if isinstance(context, dict) and context:
            pairs = " ".join(f"{k}={v}" for k, v in context.items())
            first, sep, rest = base.partition("\n")
            return f"{first} | {pairs}{sep}{rest}"
        return base


def setup_logging(
    level: str = "INFO",
    log_file: str | Path | None = None,
    max_bytes: int = 5_000_000,
    backup_count: int = 10,
    secrets: Iterable[str | None] = (),
) -> None:
    """Configura o logger raiz (console + arquivo rotativo). Idempotente."""
    register_secrets(secrets)
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, "_win_bot", False):
            root.removeHandler(handler)
            handler.close()

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if log_file:
        path = Path(log_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(
            RotatingFileHandler(path, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8")
        )
    formatter = StructuredFormatter()
    for handler in handlers:
        handler.setFormatter(formatter)
        handler.addFilter(SecretMaskingFilter())
        handler._win_bot = True  # type: ignore[attr-defined]
        root.addHandler(handler)
    root.setLevel(level)
