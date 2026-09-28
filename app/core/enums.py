"""Enumerações compartilhadas. Python puro: sem dependência de infraestrutura."""

from __future__ import annotations

from enum import Enum

# Teto absoluto de contratos nesta versão. Alterar este valor é uma decisão
# explícita de código, não de configuração (ver seção 28 da especificação).
HARD_MAX_CONTRACTS = 1


class Mode(str, Enum):
    BACKTEST = "BACKTEST"
    PAPER = "PAPER"
    LIVE_SIGNAL = "LIVE_SIGNAL"
    LIVE_EXECUTION = "LIVE_EXECUTION"


class Timeframe(str, Enum):
    M1 = "M1"
    M5 = "M5"

    @property
    def seconds(self) -> int:
        return {"M1": 60, "M5": 300}[self.value]

    @property
    def minutes(self) -> int:
        return self.seconds // 60


class VolumeType(str, Enum):
    REAL = "real"
    TICK = "tick"

    @property
    def column(self) -> str:
        return {"real": "real_volume", "tick": "tick_volume"}[self.value]


class ConnectionState(str, Enum):
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"          # instável/reconectando: nenhuma nova operação
    DISCONNECTED = "DISCONNECTED"  # tentativas esgotadas: nenhuma nova operação


class Severity(str, Enum):
    WARNING = "WARNING"  # registrado; não invalida os dados por si só
    ERROR = "ERROR"      # dados inválidos: nenhum sinal no ciclo


class SymbolTradeMode(str, Enum):
    DISABLED = "DISABLED"
    LONG_ONLY = "LONG_ONLY"
    SHORT_ONLY = "SHORT_ONLY"
    CLOSE_ONLY = "CLOSE_ONLY"
    FULL = "FULL"
    UNKNOWN = "UNKNOWN"


class AccountMarginMode(str, Enum):
    RETAIL_NETTING = "RETAIL_NETTING"
    EXCHANGE = "EXCHANGE"
    RETAIL_HEDGING = "RETAIL_HEDGING"
    UNKNOWN = "UNKNOWN"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    OTHER = "OTHER"
