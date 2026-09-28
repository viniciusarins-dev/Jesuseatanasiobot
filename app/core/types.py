"""Tipos de domínio imutáveis. Python puro: sem dependência de infraestrutura.

Todas as datas aqui são timezone-aware em UTC. A conversão a partir do horário
do servidor MT5 acontece exclusivamente em ``app.utils.time_utils``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.core.enums import AccountMarginMode, Severity, Side, SymbolTradeMode


def _require_utc(name: str, value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None or value.utcoffset().total_seconds() != 0:
        raise ValueError(f"{name} deve ser timezone-aware em UTC, recebido {value!r}")


@dataclass(frozen=True)
class Candle:
    time: datetime  # abertura do candle, UTC
    open: float
    high: float
    low: float
    close: float
    tick_volume: float
    real_volume: float

    def __post_init__(self) -> None:
        _require_utc("Candle.time", self.time)


@dataclass(frozen=True)
class Tick:
    time: datetime  # UTC
    bid: float
    ask: float
    last: float
    volume: float

    def __post_init__(self) -> None:
        _require_utc("Tick.time", self.time)


@dataclass(frozen=True)
class SymbolSpec:
    """Especificação do símbolo lida do MT5 (nunca de valores supostos)."""

    name: str
    description: str
    visible: bool
    selected: bool
    trade_mode: SymbolTradeMode
    volume_min: float
    volume_max: float
    volume_step: float
    tick_size: float
    tick_value: float
    filling_mode: int  # bitmask do MT5 (FOK=1, IOC=2; RETURN é implícito)
    stops_level: int  # em pontos
    digits: int
    currency_profit: str
    expiration_time: datetime | None  # UTC; None quando o símbolo não expira


@dataclass(frozen=True)
class TerminalSnapshot:
    connected: bool
    trade_allowed: bool
    build: int


@dataclass(frozen=True)
class AccountSnapshot:
    login: int = field(repr=False)  # dado sensível: fora do repr
    server: str = field(repr=False)
    currency: str = ""
    balance: float = 0.0
    equity: float = 0.0
    margin_mode: AccountMarginMode = AccountMarginMode.UNKNOWN
    trade_allowed: bool = False
    trade_expert: bool = False


@dataclass(frozen=True)
class PositionSnapshot:
    ticket: int
    symbol: str
    side: Side
    volume: float
    price_open: float
    sl: float
    tp: float
    magic: int
    comment: str
    time: datetime


@dataclass(frozen=True)
class OrderSnapshot:
    ticket: int
    symbol: str
    type_code: int
    volume: float
    price_open: float
    sl: float
    tp: float
    magic: int
    comment: str
    time_setup: datetime


@dataclass(frozen=True)
class DealSnapshot:
    ticket: int
    order: int
    position_id: int
    symbol: str
    side: Side
    entry_code: int
    volume: float
    price: float
    profit: float
    commission: float
    fee: float
    magic: int
    comment: str
    time: datetime


@dataclass(frozen=True)
class ValidationIssue:
    severity: Severity
    code: str
    message: str

    def __str__(self) -> str:
        return f"[{self.severity.value}] {self.code}: {self.message}"
