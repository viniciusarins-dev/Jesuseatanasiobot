"""Conversões de horário. ÚNICO lugar do sistema que lida com o fuso do servidor MT5.

Semântica dos timestamps do MT5
-------------------------------
A biblioteca MetaTrader5 devolve ``time`` (candles e ticks) como segundos desde
1970 medidos no **relógio de parede do servidor da corretora**, como se esse
relógio fosse UTC. Exemplo: servidor em UTC-3 às 10:00 locais → epoch de
"10:00 UTC". Tratar isso como UTC real desloca sessão, VWAP e fechamento de
candle. Por isso:

    utc_real = relógio_do_servidor - server_utc_offset_hours

O offset NÃO é suposto: vem de ``market.server_utc_offset_hours``. A verificação
de sanidade (hora do último tick vs. relógio da máquina) fica em ``TickManager``.

Fluxo: servidor MT5 → UTC (armazenamento/cálculo) → America/Sao_Paulo (sessão).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.errors import MissingConfigValue

UTC = timezone.utc


def offset_delta(offset_hours: float | None) -> timedelta:
    """Offset do servidor como timedelta; falha se não configurado."""
    if offset_hours is None:
        raise MissingConfigValue(
            "market.server_utc_offset_hours",
            "fuso horário do servidor MT5 da corretora (ex.: -3 para horário de Brasília)",
        )
    return timedelta(hours=offset_hours)


def server_epoch_to_utc(epoch_seconds: float, offset_hours: float | None) -> datetime:
    wall = datetime.fromtimestamp(float(epoch_seconds), tz=UTC)
    return wall - offset_delta(offset_hours)


def server_epochs_to_utc(epochs: pd.Series, offset_hours: float | None) -> pd.Series:
    """Versão vetorizada. Retorna ``datetime64[ns, UTC]``."""
    delta = pd.Timedelta(offset_delta(offset_hours))
    wall = pd.to_datetime(epochs.astype("int64"), unit="s", utc=True)
    return (wall - delta).astype("datetime64[ns, UTC]")


def server_epochs_ms_to_utc(epochs_ms: pd.Series, offset_hours: float | None) -> pd.Series:
    """Como ``server_epochs_to_utc``, para milissegundos (``time_msc`` dos ticks)."""
    delta = pd.Timedelta(offset_delta(offset_hours))
    wall = pd.to_datetime(epochs_ms.astype("int64"), unit="ms", utc=True)
    return (wall - delta).astype("datetime64[ns, UTC]")


def utc_to_server_naive(dt: datetime, offset_hours: float | None) -> datetime:
    """Converte UTC real para o relógio do servidor, no formato aceito por
    ``copy_rates_range``/``copy_ticks_range`` (datetime com tz UTC representando
    o relógio de parede do servidor)."""
    return ensure_utc(dt) + offset_delta(offset_hours)


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError(f"datetime sem timezone não é permitido: {dt!r}")
    return dt.astimezone(UTC)


def now_utc() -> datetime:
    return datetime.now(tz=UTC)


def to_local(dt: datetime, tz: ZoneInfo) -> datetime:
    return ensure_utc(dt).astimezone(tz)


def trading_date(dt_utc: datetime, tz: ZoneInfo) -> date:
    """Data do pregão (no fuso do mercado) de um instante UTC."""
    return to_local(dt_utc, tz).date()


def is_within(local_time: time, start: time, end: time) -> bool:
    """Intervalo semiaberto [start, end)."""
    return start <= local_time < end


def local_session_bounds(day: date, start: time, end: time, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Início/fim de uma janela local convertidos para UTC (respeita horário de verão)."""
    return (
        datetime.combine(day, start, tzinfo=tz).astimezone(UTC),
        datetime.combine(day, end, tzinfo=tz).astimezone(UTC),
    )
