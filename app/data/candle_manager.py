"""Candles fechados, detecção de candle novo e decisão de usabilidade.

REGRA CRÍTICA — candle em formação
----------------------------------
Um candle com abertura ``t`` só está FECHADO quando ``t + timeframe <= server_now``,
onde ``server_now`` é a hora do último tick FRESCO (ver ``TickManager``).
Sem tick fresco não há como afirmar que o último candle fechou → o snapshot é
marcado como não utilizável (falha segura). ``closed_candles`` é uma função
pura e é a mesma regra usada em todos os modos.

Um snapshot só é ``usable`` quando: tick fresco, validação sem ERROR, sem gap
intradiário (se ``block_on_gaps``) e pelo menos um candle fechado.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.enums import Severity, Timeframe, VolumeType
from app.core.errors import MT5Error
from app.core.types import ValidationIssue
from app.data.tick_manager import TickManager
from app.data.validation import validate_candles
from app.utils.logger import ctx

logger = logging.getLogger(__name__)

LAST_PROCESSED_KEY = "last_processed_candle"


class RatesSource(Protocol):
    def copy_rates(self, symbol: str, timeframe: Timeframe, count: int, start_pos: int = 0) -> pd.DataFrame: ...


class StateStore(Protocol):
    """Persistência chave/valor. Implementação SQLite na fase de banco de dados."""

    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str) -> None: ...


class InMemoryStateStore:
    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._data.get(key)

    def set(self, key: str, value: str) -> None:
        self._data[key] = value


def closed_candles(df: pd.DataFrame, server_now: datetime, timeframe: Timeframe) -> pd.DataFrame:
    """Mantém somente candles cujo período já terminou em ``server_now``."""
    if df.empty:
        return df
    close_time = df["time"] + pd.Timedelta(seconds=timeframe.seconds)
    return df.loc[close_time <= pd.Timestamp(server_now)].reset_index(drop=True)


def with_volume_column(df: pd.DataFrame, volume_type: VolumeType) -> pd.DataFrame:
    """Adiciona ``volume`` a partir da coluna escolhida em ``market.volume_type``."""
    out = df.copy()
    out["volume"] = out[volume_type.column].astype("float64")
    return out


@dataclass(frozen=True)
class CandleSnapshot:
    candles: pd.DataFrame  # somente candles FECHADOS e validados
    last_closed_time: datetime | None
    is_new: bool  # último candle fechado ainda não foi processado
    usable: bool
    issues: tuple[ValidationIssue, ...]
    server_now: datetime | None

    @property
    def reasons(self) -> str:
        return "; ".join(str(i) for i in self.issues if i.severity is Severity.ERROR) or "ok"


class CandleManager:
    def __init__(
        self,
        source: RatesSource,
        ticks: TickManager,
        symbol: str,
        timeframe: Timeframe,
        tz: ZoneInfo,
        volume_type: VolumeType,
        history_bars: int,
        block_on_gaps: bool,
        state: StateStore,
    ) -> None:
        self._source = source
        self._ticks = ticks
        self._symbol = symbol
        self._timeframe = timeframe
        self._tz = tz
        self._volume_type = volume_type
        self._history_bars = history_bars
        self._block_on_gaps = block_on_gaps
        self._state = state
        self._state_key = f"{LAST_PROCESSED_KEY}:{symbol}:{timeframe.value}"

    def snapshot(self) -> CandleSnapshot:
        """Busca, filtra e valida. Nunca lança exceção de dados: falhas → ``usable=False``."""
        issues: list[ValidationIssue] = []
        tick_status = self._ticks.status()
        issues.extend(tick_status.issues)
        server_now = tick_status.server_now

        try:
            # +1: o candle em formação é descartado adiante.
            raw = self._source.copy_rates(self._symbol, self._timeframe, self._history_bars + 1)
        except MT5Error as exc:
            issues.append(ValidationIssue(Severity.ERROR, "rates_unavailable", str(exc)))
            return self._unusable(issues, server_now)

        if server_now is None:
            issues.append(
                ValidationIssue(Severity.ERROR, "no_server_clock", "sem tick fresco: impossível confirmar candle fechado")
            )
            return self._unusable(issues, None)

        validation = validate_candles(raw, self._timeframe, self._tz, self._volume_type, now_utc=server_now)
        issues.extend(validation.issues)
        closed = closed_candles(validation.candles, server_now, self._timeframe)

        if closed.empty:
            issues.append(ValidationIssue(Severity.ERROR, "no_closed_candle", "nenhum candle fechado"))
        elif len(closed) < self._history_bars:
            issues.append(
                ValidationIssue(
                    Severity.WARNING,
                    "short_history",
                    f"{len(closed)} candles fechados (solicitados {self._history_bars})",
                )
            )
        if validation.has_gaps and self._block_on_gaps:
            issues.append(ValidationIssue(Severity.ERROR, "gap_blocked", "gap intradiário na janela (data.block_on_gaps)"))

        usable = validation.ok and not any(i.severity is Severity.ERROR for i in issues)
        if not usable or closed.empty:
            return self._unusable(issues, server_now)

        closed = with_volume_column(closed, self._volume_type)
        last_closed = closed["time"].iloc[-1].to_pydatetime()
        is_new = self._state.get(self._state_key) != last_closed.isoformat()
        if is_new:
            logger.info("Novo candle fechado", extra=ctx(symbol=self._symbol, tf=self._timeframe.value, time=last_closed.isoformat()))
        for issue in issues:
            logger.warning("Aviso de dados", extra=ctx(symbol=self._symbol, issue=str(issue)))
        return CandleSnapshot(closed, last_closed, is_new, True, tuple(issues), server_now)

    def mark_processed(self, candle_time: datetime) -> None:
        """Chamado DEPOIS que a estratégia processou o candle (evita reprocessar após restart)."""
        self._state.set(self._state_key, candle_time.isoformat())

    def _unusable(self, issues: list[ValidationIssue], server_now: datetime | None) -> CandleSnapshot:
        """Snapshot inutilizável NUNCA carrega candles, para que ninguém os use por engano."""
        logger.warning(
            "Dados inutilizáveis neste ciclo — nenhum sinal será gerado",
            extra=ctx(symbol=self._symbol, reasons="; ".join(str(i) for i in issues if i.severity is Severity.ERROR)),
        )
        return CandleSnapshot(pd.DataFrame(), None, False, False, tuple(issues), server_now)
