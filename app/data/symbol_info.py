"""Validação do ativo antes de qualquer uso (seção 8 da especificação).

Os valores vêm do MT5 e são CONFERIDOS contra ``config.yaml`` (tick_size,
tick_value). Nada é suposto: valor ausente na configuração = falha.

Sessões de negociação: a API Python do MetaTrader5 não expõe os horários de
sessão do símbolo. O horário operacional vem de ``session.*`` no config.yaml,
e a validação aqui garante que o MT5 permite negociar o símbolo (trade_mode).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

from app.config.settings import MarketConfig
from app.core.enums import Severity, SymbolTradeMode
from app.core.types import SymbolSpec, ValidationIssue
from app.utils.logger import ctx
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)


class SymbolSource(Protocol):
    def symbol_spec(self, symbol: str) -> SymbolSpec | None: ...
    def select_symbol(self, symbol: str) -> bool: ...


@dataclass(frozen=True)
class SymbolValidationReport:
    symbol: str | None
    spec: SymbolSpec | None
    issues: tuple[ValidationIssue, ...]

    @property
    def ok(self) -> bool:
        return self.spec is not None and not any(i.severity is Severity.ERROR for i in self.issues)

    def summary(self) -> str:
        return "; ".join(str(i) for i in self.issues) or "ok"


def _close(a: float, b: float, rel_tol: float) -> bool:
    return math.isclose(a, b, rel_tol=rel_tol, abs_tol=1e-12)


def validate_symbol(
    source: SymbolSource,
    market: MarketConfig,
    require_trading: bool,
    now: datetime | None = None,
) -> SymbolValidationReport:
    """Valida o símbolo configurado.

    ``require_trading``: True para modos que enviam ordens (exige trade_mode FULL).
    Para modos só de dados/sinais, restrições de negociação viram WARNING.
    """
    issues: list[ValidationIssue] = []

    def add(severity: Severity, code: str, message: str) -> None:
        issues.append(ValidationIssue(severity, code, message))

    symbol = market.symbol
    if symbol is None:
        add(Severity.ERROR, "symbol_not_configured", "CONFIGURÁVEL: market.symbol (nome exato do ativo na corretora)")
        return _finish(SymbolValidationReport(None, None, tuple(issues)))

    spec = source.symbol_spec(symbol)
    if spec is None:
        add(Severity.ERROR, "symbol_not_found", f"símbolo '{symbol}' não existe nesta corretora/servidor")
        return _finish(SymbolValidationReport(symbol, None, tuple(issues)))

    if not spec.visible or not spec.selected:
        if source.select_symbol(symbol):
            refreshed = source.symbol_spec(symbol)
            spec = refreshed or spec
        if not spec.visible or not spec.selected:
            add(Severity.ERROR, "symbol_not_selected", "não foi possível adicionar o símbolo ao Market Watch")

    trade_error = Severity.ERROR if require_trading else Severity.WARNING
    if spec.trade_mode is not SymbolTradeMode.FULL:
        add(trade_error, "trade_not_allowed", f"trade_mode={spec.trade_mode.value} (necessário FULL)")

    if spec.volume_min <= 0:
        add(Severity.ERROR, "volume_min_invalid", f"volume_min={spec.volume_min}")
    if spec.volume_max < spec.volume_min:
        add(Severity.ERROR, "volume_max_invalid", f"volume_max={spec.volume_max} < volume_min={spec.volume_min}")
    if spec.volume_step <= 0:
        add(Severity.ERROR, "volume_step_invalid", f"volume_step={spec.volume_step}")

    if spec.tick_size <= 0:
        add(Severity.ERROR, "tick_size_invalid", f"tick_size do MT5 = {spec.tick_size}")
    elif market.tick_size is None:
        add(Severity.ERROR, "tick_size_not_configured", f"CONFIGURÁVEL: market.tick_size (MT5 informa {spec.tick_size})")
    elif not _close(spec.tick_size, market.tick_size, 1e-9):
        add(Severity.ERROR, "tick_size_mismatch", f"MT5={spec.tick_size} config={market.tick_size}")

    if spec.tick_value <= 0:
        add(Severity.ERROR, "tick_value_invalid", f"tick_value do MT5 = {spec.tick_value}")
    elif market.tick_value is None:
        add(Severity.ERROR, "tick_value_not_configured", f"CONFIGURÁVEL: market.tick_value (MT5 informa {spec.tick_value})")
    elif not _close(spec.tick_value, market.tick_value, max(market.tick_value_tolerance, 1e-9)):
        add(Severity.ERROR, "tick_value_mismatch", f"MT5={spec.tick_value} config={market.tick_value}")

    if spec.stops_level < 0:
        add(Severity.ERROR, "stops_level_invalid", f"stops_level={spec.stops_level}")
    if spec.filling_mode < 0:
        add(Severity.ERROR, "filling_mode_invalid", f"filling_mode={spec.filling_mode}")

    if spec.expiration_time is not None:
        current = now or now_utc()
        if spec.expiration_time <= current:
            add(Severity.ERROR, "contract_expired", f"contrato venceu em {spec.expiration_time.isoformat()}")
        elif spec.expiration_time - current <= timedelta(days=market.rollover_warning_days):
            add(Severity.WARNING, "rollover_soon", f"contrato vence em {spec.expiration_time.isoformat()}: planeje a rolagem")

    return _finish(SymbolValidationReport(symbol, spec, tuple(issues)))


def _finish(report: SymbolValidationReport) -> SymbolValidationReport:
    spec = report.spec
    if spec is not None:
        logger.info(
            "Especificação do símbolo",
            extra=ctx(
                symbol=spec.name,
                trade_mode=spec.trade_mode.value,
                volume_min=spec.volume_min,
                volume_max=spec.volume_max,
                volume_step=spec.volume_step,
                tick_size=spec.tick_size,
                tick_value=spec.tick_value,
                filling_mode=spec.filling_mode,
                stops_level=spec.stops_level,
                digits=spec.digits,
                expiration=spec.expiration_time.isoformat() if spec.expiration_time else "none",
            ),
        )
    if report.ok:
        logger.info("Símbolo validado", extra=ctx(symbol=report.symbol, avisos=report.summary()))
    else:
        logger.error("Símbolo reprovado — NÃO OPERAR", extra=ctx(symbol=report.symbol, motivo=report.summary()))
    return report
