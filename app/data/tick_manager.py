"""Ticks: último preço, detecção de dado congelado e sanidade do relógio/offset.

O "relógio do servidor" usado para decidir se um candle fechou é a hora do
último tick FRESCO. Como candles e ticks passam pela mesma conversão de fuso,
um offset errado se cancela nessa comparação; já a comparação tick × relógio da
máquina (``age_seconds``) expõe o offset errado e dispara o estado inseguro.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Protocol

import pandas as pd

from app.core.enums import Severity
from app.core.errors import MT5Error
from app.core.types import Tick, ValidationIssue
from app.utils.logger import ctx
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)


class TickSource(Protocol):
    def last_tick(self, symbol: str) -> Tick | None: ...
    def copy_ticks_range(self, symbol: str, start_utc: datetime, end_utc: datetime) -> pd.DataFrame: ...


@dataclass(frozen=True)
class TickStatus:
    tick: Tick | None
    age_seconds: float | None  # relógio local - hora do tick
    issues: tuple[ValidationIssue, ...]

    @property
    def fresh(self) -> bool:
        """Tick válido e recente. Só nesse caso o relógio do servidor é confiável."""
        return self.tick is not None and not any(i.severity is Severity.ERROR for i in self.issues)

    @property
    def server_now(self) -> datetime | None:
        return self.tick.time if self.fresh and self.tick else None

    @property
    def suggested_offset_correction_hours(self) -> int | None:
        """Se a defasagem for ~múltiplo de 1h, provavelmente o offset do servidor está errado."""
        if self.age_seconds is None or abs(self.age_seconds) < 1800:
            return None
        return round(self.age_seconds / 3600)


class TickManager:
    def __init__(
        self,
        source: TickSource,
        symbol: str,
        max_tick_age_seconds: float,
        clock_tolerance_seconds: float,
        clock: Callable[[], datetime] = now_utc,
    ) -> None:
        self._source = source
        self._symbol = symbol
        self._max_age = max_tick_age_seconds
        self._tolerance = clock_tolerance_seconds
        self._clock = clock

    def status(self) -> TickStatus:
        """Nunca lança exceção de dados: falhas viram ``issues`` (estado seguro)."""
        issues: list[ValidationIssue] = []
        try:
            tick = self._source.last_tick(self._symbol)
        except MT5Error as exc:
            issue = ValidationIssue(Severity.ERROR, "tick_unavailable", str(exc))
            logger.warning("Tick indisponível", extra=ctx(symbol=self._symbol, error=str(exc)))
            return TickStatus(None, None, (issue,))
        if tick is None:
            return TickStatus(None, None, (ValidationIssue(Severity.ERROR, "no_tick", "nenhum tick recebido"),))

        issues.extend(validate_tick(tick))
        age = (self._clock() - tick.time).total_seconds()
        if age < -self._tolerance:
            issues.append(
                ValidationIssue(
                    Severity.ERROR,
                    "clock_skew",
                    f"tick {-age:.0f}s no futuro: offset do servidor ou relógio local incorretos",
                )
            )
        elif age > self._max_age:
            issues.append(
                ValidationIssue(Severity.ERROR, "stale_tick", f"último tick há {age:.0f}s (máx. {self._max_age:.0f}s)")
            )
        status = TickStatus(tick, age, tuple(issues))
        if not status.fresh:
            logger.warning(
                "Tick não confiável",
                extra=ctx(symbol=self._symbol, age_s=f"{age:.1f}", issues="; ".join(map(str, issues))),
            )
        return status

    def ticks_between(self, start_utc: datetime, end_utc: datetime) -> pd.DataFrame:
        return self._source.copy_ticks_range(self._symbol, start_utc, end_utc)


def validate_tick(tick: Tick) -> list[ValidationIssue]:
    issues = []
    if tick.bid <= 0 or tick.ask <= 0:
        issues.append(ValidationIssue(Severity.ERROR, "no_quote", f"bid/ask inválidos ({tick.bid}/{tick.ask})"))
    elif tick.ask < tick.bid:
        issues.append(ValidationIssue(Severity.ERROR, "crossed_quote", f"ask {tick.ask} < bid {tick.bid}"))
    return issues
