"""Validação de candles (independente da fonte: MT5 ou arquivo histórico).

Classificação:
* ERROR  → dados inválidos. Quem consome NÃO pode gerar sinal com eles.
* WARNING → anomalia registrada (ex.: gap intradiário, duplicado idêntico removido).

A função nunca "conserta" valores: só remove duplicatas EXATAS e ordena.
Qualquer outra inconsistência é reportada.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.enums import Severity, Timeframe, VolumeType
from app.core.types import ValidationIssue

PRICE_COLUMNS = ("open", "high", "low", "close")
REQUIRED_COLUMNS = ("time", *PRICE_COLUMNS, "tick_volume", "real_volume")
# Datas anteriores a isso indicam epoch zerado/corrompido.
_MIN_VALID_TIME = pd.Timestamp("2000-01-01", tz="UTC")
_EPOCH = pd.Timestamp(0, tz="UTC")


@dataclass(frozen=True)
class Gap:
    after: datetime  # último candle antes do buraco (UTC)
    before: datetime  # primeiro candle depois do buraco (UTC)
    missing_bars: int


@dataclass(frozen=True)
class CandleValidation:
    candles: pd.DataFrame  # ordenado, sem duplicatas exatas
    issues: tuple[ValidationIssue, ...]
    gaps: tuple[Gap, ...]

    @property
    def ok(self) -> bool:
        return not any(i.severity is Severity.ERROR for i in self.issues)

    @property
    def has_gaps(self) -> bool:
        return bool(self.gaps)


def validate_candles(
    df: pd.DataFrame,
    timeframe: Timeframe,
    tz: ZoneInfo,
    volume_type: VolumeType,
    now_utc: datetime | None = None,
) -> CandleValidation:
    issues: list[ValidationIssue] = []

    def add(severity: Severity, code: str, message: str) -> None:
        issues.append(ValidationIssue(severity, code, message))

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        add(Severity.ERROR, "missing_columns", f"colunas ausentes: {missing}")
        return CandleValidation(df, tuple(issues), ())
    if df.empty:
        add(Severity.ERROR, "empty", "nenhum candle recebido")
        return CandleValidation(df, tuple(issues), ())

    out = df.copy()
    if not isinstance(out["time"].dtype, pd.DatetimeTZDtype) or str(out["time"].dt.tz) != "UTC":
        add(Severity.ERROR, "time_not_utc", "coluna 'time' deve ser datetime timezone-aware em UTC")
        return CandleValidation(df, tuple(issues), ())

    numeric = [*PRICE_COLUMNS, "tick_volume", "real_volume"]
    nulls = out[["time", *numeric]].isna().sum()
    if nulls.any():
        add(Severity.ERROR, "missing_values", f"valores ausentes: {nulls[nulls > 0].to_dict()}")
        return CandleValidation(out, tuple(issues), ())

    # --- ordenação e duplicados --------------------------------------------------
    if not out["time"].is_monotonic_increasing:
        add(Severity.WARNING, "unsorted", "candles fora de ordem cronológica; reordenados")
        out = out.sort_values("time", kind="stable")

    exact_dupes = out.duplicated(keep="first")
    if exact_dupes.any():
        add(Severity.WARNING, "duplicate_exact", f"{int(exact_dupes.sum())} candle(s) duplicado(s) idênticos removidos")
        out = out.loc[~exact_dupes]
    conflicting = out["time"].duplicated(keep=False)
    if conflicting.any():
        times = sorted({str(t) for t in out.loc[conflicting, "time"]})
        add(Severity.ERROR, "duplicate_conflict", f"mesmo timestamp com valores diferentes: {times[:5]}")
    out = out.reset_index(drop=True)

    # --- timestamps ---------------------------------------------------------------
    if (out["time"] < _MIN_VALID_TIME).any():
        add(Severity.ERROR, "invalid_timestamp", "timestamp anterior a 2000-01-01 (epoch inválido)")
    step = timeframe.seconds
    # Independe da resolução interna (ns/us/s) do datetime64.
    seconds = (out["time"] - _EPOCH).dt.total_seconds()
    if (seconds % step != 0).any():
        add(Severity.ERROR, "misaligned_timestamp", f"abertura não alinhada ao timeframe {timeframe.value}")
    if now_utc is not None:
        future = out["time"] > pd.Timestamp(now_utc) + pd.Timedelta(seconds=step)
        if future.any():
            add(Severity.ERROR, "future_timestamp", f"{int(future.sum())} candle(s) com horário no futuro")

    # --- OHLC e volume --------------------------------------------------------------
    if (out[list(PRICE_COLUMNS)] <= 0).any().any():
        add(Severity.ERROR, "non_positive_price", "preço <= 0")
    body_high = out[["open", "close"]].max(axis=1)
    body_low = out[["open", "close"]].min(axis=1)
    incoherent = (out["high"] < body_high) | (out["low"] > body_low) | (out["high"] < out["low"])
    if incoherent.any():
        add(Severity.ERROR, "ohlc_incoherent", f"{int(incoherent.sum())} candle(s) com OHLC incoerente")
    if (out[["tick_volume", "real_volume"]] < 0).any().any():
        add(Severity.ERROR, "negative_volume", "volume negativo")
    if (out[volume_type.column] == 0).all():
        add(
            Severity.ERROR,
            "volume_unavailable",
            f"coluna '{volume_type.column}' zerada: a corretora não fornece esse volume "
            f"(ajuste market.volume_type)",
        )

    # --- gaps intradiários --------------------------------------------------------
    gaps = _find_intraday_gaps(out, timeframe, tz)
    for gap in gaps:
        add(
            Severity.WARNING,
            "gap",
            f"{gap.missing_bars} candle(s) ausente(s) entre {gap.after.isoformat()} e {gap.before.isoformat()}",
        )

    return CandleValidation(out, tuple(issues), tuple(gaps))


def _find_intraday_gaps(df: pd.DataFrame, timeframe: Timeframe, tz: ZoneInfo) -> list[Gap]:
    """Buracos dentro do MESMO pregão (a virada de dia não é gap)."""
    if len(df) < 2:
        return []
    times = df["time"]
    local_dates = times.dt.tz_convert(tz).dt.date
    deltas = times.diff()
    step = pd.Timedelta(seconds=timeframe.seconds)
    mask = (deltas > step) & (local_dates == local_dates.shift())
    gaps = []
    for idx in df.index[mask.fillna(False)]:
        before = times.loc[idx]
        after = times.loc[idx - 1]
        gaps.append(
            Gap(
                after=after.to_pydatetime(),
                before=before.to_pydatetime(),
                missing_bars=int((before - after) / step) - 1,
            )
        )
    return gaps


def timeframe_delta(timeframe: Timeframe) -> timedelta:
    return timedelta(seconds=timeframe.seconds)
