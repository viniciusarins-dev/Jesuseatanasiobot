"""Ponto de entrada: ``python -m app.main --mode <modo>``.

FASE 1: apenas carrega e valida a configuração e o logging. Os modos serão
ligados nas fases seguintes; até lá, qualquer modo encerra sem operar.
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.config.settings import load_settings
from app.core.enums import Mode
from app.core.errors import ConfigError
from app.utils.logger import setup_logging

logger = logging.getLogger("app.main")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app.main", description="WIN trading bot")
    parser.add_argument(
        "--mode",
        required=True,
        choices=[m.value.lower() for m in Mode],
        help="modo de operação",
    )
    parser.add_argument("--config", default="config.yaml", help="caminho do config.yaml")
    parser.add_argument("--env", default=".env", help="caminho do .env")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        settings = load_settings(args.config, args.env)
    except ConfigError as exc:
        setup_logging()
        logger.error("Configuração inválida: %s", exc)
        return 2

    log = settings.logging
    setup_logging(log.level, log.file, log.max_bytes, log.backup_count, settings.credentials.secret_values())
    mode = Mode(args.mode.upper())
    logger.info("Configuração carregada", extra={"ctx": {"modo_cli": mode.value, "modo_config": settings.execution.mode.value}})
    logger.warning("Modo %s ainda não implementado (Fase 1: somente camada de dados). Nada foi executado.", mode.value)
    return 2


if __name__ == "__main__":
    sys.exit(main())
