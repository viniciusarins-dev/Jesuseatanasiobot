"""Dados históricos em arquivo (formato canônico) para backtest reproduzível.

Formato CSV canônico::

    time,open,high,low,close,tick_volume,real_volume,spread
    2026-09-01T12:10:00+00:00,...

* ``time`` = abertura do candle em UTC (ISO-8601 com offset).
* Arquivo ``<nome>.meta.json`` ao lado registra símbolo, timeframe, offset do
  servidor usado na conversão, período e data da exportação.

Somente CSV: evita dependência extra (Parquet exigiria pyarrow).
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.enums import Timeframe, VolumeType
from app.core.errors import DataValidationError
from app.data.validation import CandleValidation, validate_candles
from app.utils.logger import ctx
from app.utils.time_utils import ensure_utc, now_utc

logger = logging.getLogger(__name__)

CSV_COLUMNS = ("time", "open", "high", "low", "close", "tick_volume", "real_volume", "spread")


class RangeRatesSource(Protocol):
    def copy_rates_range(
        self, symbol: str, timeframe: Timeframe, start_utc: datetime, end_utc: datetime
    ) -> pd.DataFrame: ...


@dataclass(frozen=True)
class HistoricalMeta:
    symbol: str
    timeframe: str
    server_utc_offset_hours: float | None
    start_utc: str
    end_utc: str
    rows: int
    exported_at_utc: str
    source: str


def meta_path(csv_path: Path) -> Path:
    return csv_path.with_suffix(".meta.json")


def write_csv(df: pd.DataFrame, path: Path, meta: HistoricalMeta) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = df.loc[:, list(CSV_COLUMNS)].copy()
    out["time"] = out["time"].map(lambda t: t.isoformat())
    out.to_csv(path, index=False)
    meta_path(path).write_text(json.dumps(asdict(meta), indent=2, ensure_ascii=False), encoding="utf-8")


def export_from_mt5(
    source: RangeRatesSource,
    symbol: str,
    timeframe: Timeframe,
    start_utc: datetime,
    end_utc: datetime,
    path: Path,
    server_utc_offset_hours: float | None,
) -> int:
    """Exporta candles do MT5 para o CSV canônico. Retorna o número de linhas.

    O candle em formação (se ``end_utc`` for "agora") é removido: só candles
    cujo período terminou antes de ``end_utc`` são gravados.
    """
    start_utc, end_utc = ensure_utc(start_utc), ensure_utc(end_utc)
    df = source.copy_rates_range(symbol, timeframe, start_utc, end_utc)
    if not df.empty:
        close_time = df["time"] + pd.Timedelta(seconds=timeframe.seconds)
        df = df.loc[close_time <= pd.Timestamp(end_utc)].reset_index(drop=True)
    meta = HistoricalMeta(
        symbol=symbol,
        timeframe=timeframe.value,
        server_utc_offset_hours=server_utc_offset_hours,
        start_utc=start_utc.isoformat(),
        end_utc=end_utc.isoformat(),
        rows=len(df),
        exported_at_utc=now_utc().isoformat(),
        source="MetaTrader5.copy_rates_range",
    )
    write_csv(df, path, meta)
    logger.info("Histórico exportado", extra=ctx(symbol=symbol, tf=timeframe.value, rows=len(df), path=str(path)))
    return len(df)


def load_csv(
    path: Path | str,
    timeframe: Timeframe,
    tz: ZoneInfo,
    volume_type: VolumeType,
    expected_symbol: str | None = None,
) -> CandleValidation:
    """Carrega e valida. Lança ``DataValidationError`` se houver ERROR."""
    path = Path(path)
    if not path.exists():
        raise DataValidationError(f"Arquivo histórico não encontrado: {path}")

    meta_file = meta_path(path)
    if meta_file.exists():
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        if meta.get("timeframe") != timeframe.value:
            raise DataValidationError(f"Timeframe do arquivo ({meta.get('timeframe')}) difere do solicitado ({timeframe.value})")
        if expected_symbol and meta.get("symbol") != expected_symbol:
            raise DataValidationError(f"Símbolo do arquivo ({meta.get('symbol')}) difere do esperado ({expected_symbol})")
    else:
        logger.warning("Arquivo histórico sem metadados (.meta.json)", extra=ctx(path=str(path)))

    try:
        df = pd.read_csv(path)
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as exc:
        raise DataValidationError(f"CSV inválido: {path}: {exc}") from exc
    missing = [c for c in CSV_COLUMNS if c not in df.columns]
    if missing:
        raise DataValidationError(f"CSV sem colunas obrigatórias {missing}: {path}")
    try:
        df["time"] = pd.to_datetime(df["time"], utc=False, format="ISO8601")
    except (ValueError, TypeError) as exc:
        raise DataValidationError(f"Coluna 'time' inválida em {path}: {exc}") from exc
    if getattr(df["time"].dt, "tz", None) is None:
        raise DataValidationError("Coluna 'time' sem timezone: o formato canônico exige UTC explícito")
    df["time"] = df["time"].dt.tz_convert("UTC").astype("datetime64[ns, UTC]")

    result = validate_candles(df, timeframe, tz, volume_type)
    for issue in result.issues:
        logger.warning("Histórico: %s", issue, extra=ctx(path=str(path)))
    if not result.ok:
        raise DataValidationError(f"Histórico inválido ({path}): " + "; ".join(map(str, result.issues)))
    return result
