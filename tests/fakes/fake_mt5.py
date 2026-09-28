"""Dublê da biblioteca ``MetaTrader5`` para testes (mesma superfície de API usada).

Horários são armazenados como epoch do RELÓGIO DO SERVIDOR (igual ao MT5 real).
Não possui ``order_send``/``order_check``: a Fase 1 é somente leitura, e um
teste garante que o cliente não tente usá-las.
"""

from __future__ import annotations

from collections import namedtuple
from dataclasses import dataclass, field
from typing import Any

import numpy as np

TerminalInfo = namedtuple("TerminalInfo", "connected trade_allowed build")
AccountInfo = namedtuple(
    "AccountInfo", "login server currency balance equity margin_mode trade_allowed trade_expert"
)
SymbolInfo = namedtuple(
    "SymbolInfo",
    "name description visible select trade_mode volume_min volume_max volume_step "
    "trade_tick_size trade_tick_value filling_mode trade_stops_level digits currency_profit expiration_time",
)
TickInfo = namedtuple("TickInfo", "time bid ask last volume time_msc flags volume_real")
Position = namedtuple("Position", "ticket symbol type volume price_open sl tp magic comment time")

RATE_DTYPE = np.dtype(
    [
        ("time", "<i8"), ("open", "<f8"), ("high", "<f8"), ("low", "<f8"), ("close", "<f8"),
        ("tick_volume", "<u8"), ("spread", "<i4"), ("real_volume", "<u8"),
    ]
)


def default_symbol(name: str = "WINTEST", **overrides: Any) -> SymbolInfo:
    base = dict(
        name=name, description="Mini índice (fake)", visible=True, select=True, trade_mode=4,
        volume_min=1.0, volume_max=100.0, volume_step=1.0, trade_tick_size=5.0, trade_tick_value=1.0,
        filling_mode=2, trade_stops_level=0, digits=0, currency_profit="BRL", expiration_time=0,
    )
    base.update(overrides)
    return SymbolInfo(**base)


@dataclass
class FakeMT5:
    # constantes (valores iguais aos da lib oficial)
    TIMEFRAME_M1: int = 1
    TIMEFRAME_M5: int = 5
    COPY_TICKS_ALL: int = -1
    SYMBOL_TRADE_MODE_DISABLED: int = 0
    SYMBOL_TRADE_MODE_LONGONLY: int = 1
    SYMBOL_TRADE_MODE_SHORTONLY: int = 2
    SYMBOL_TRADE_MODE_CLOSEONLY: int = 3
    SYMBOL_TRADE_MODE_FULL: int = 4
    ACCOUNT_MARGIN_MODE_RETAIL_NETTING: int = 0
    ACCOUNT_MARGIN_MODE_EXCHANGE: int = 1
    ACCOUNT_MARGIN_MODE_RETAIL_HEDGING: int = 2
    POSITION_TYPE_BUY: int = 0
    POSITION_TYPE_SELL: int = 1
    DEAL_TYPE_BUY: int = 0
    DEAL_TYPE_SELL: int = 1

    # estado controlável pelos testes
    account_login: int = 123456
    margin_mode: int = 1
    symbols: dict[str, SymbolInfo] = field(default_factory=lambda: {"WINTEST": default_symbol()})
    rates: dict[tuple[str, int], np.ndarray] = field(default_factory=dict)
    ticks: dict[str, TickInfo] = field(default_factory=dict)
    positions: list[Position] = field(default_factory=list)
    fail_initialize_times: int = 0
    connected: bool = False
    symbol_select_works: bool = True
    calls: list[str] = field(default_factory=list)
    initialize_kwargs: list[dict[str, Any]] = field(default_factory=list)
    _last_error: tuple[int, str] = (1, "Success")

    # -- conexão
    def initialize(self, **kwargs: Any) -> bool:
        self.calls.append("initialize")
        self.initialize_kwargs.append(kwargs)
        if self.fail_initialize_times > 0:
            self.fail_initialize_times -= 1
            self._last_error = (-10004, "No IPC connection")
            return False
        self.connected = True
        self._last_error = (1, "Success")
        return True

    def shutdown(self) -> None:
        self.calls.append("shutdown")
        self.connected = False

    def last_error(self) -> tuple[int, str]:
        return self._last_error

    def drop_connection(self) -> None:
        self.connected = False
        self._last_error = (-10004, "No IPC connection")

    def terminal_info(self) -> TerminalInfo | None:
        return TerminalInfo(connected=self.connected, trade_allowed=True, build=4000) if self.connected else None

    def account_info(self) -> AccountInfo | None:
        if not self.connected:
            return None
        return AccountInfo(
            login=self.account_login, server="Fake-Server", currency="BRL", balance=10000.0, equity=10000.0,
            margin_mode=self.margin_mode, trade_allowed=True, trade_expert=True,
        )

    # -- símbolo
    def symbol_info(self, symbol: str) -> SymbolInfo | None:
        if not self.connected:
            self.drop_connection()
            return None
        info = self.symbols.get(symbol)
        if info is None:
            self._last_error = (-1, "symbol not found")
        return info

    def symbol_select(self, symbol: str, enable: bool) -> bool:
        if symbol not in self.symbols or not self.symbol_select_works:
            return False
        self.symbols[symbol] = self.symbols[symbol]._replace(visible=True, select=True)
        return True

    def symbol_info_tick(self, symbol: str) -> TickInfo | None:
        if not self.connected:
            self.drop_connection()
            return None
        return self.ticks.get(symbol)

    # -- dados
    def copy_rates_from_pos(self, symbol: str, timeframe: int, start_pos: int, count: int) -> np.ndarray | None:
        self.calls.append("copy_rates_from_pos")
        if not self.connected:
            self.drop_connection()
            return None
        data = self.rates.get((symbol, timeframe))
        if data is None:
            return np.empty(0, dtype=RATE_DTYPE)
        end = len(data) - start_pos
        return data[max(0, end - count): end]

    def copy_rates_range(self, symbol: str, timeframe: int, date_from: Any, date_to: Any) -> np.ndarray | None:
        if not self.connected:
            self.drop_connection()
            return None
        data = self.rates.get((symbol, timeframe), np.empty(0, dtype=RATE_DTYPE))
        lo, hi = int(date_from.timestamp()), int(date_to.timestamp())
        return data[(data["time"] >= lo) & (data["time"] <= hi)]

    def positions_get(self, symbol: str | None = None) -> tuple | None:
        if not self.connected:
            self.drop_connection()
            return None
        items = [p for p in self.positions if symbol is None or p.symbol == symbol]
        if not items:
            self._last_error = (1, "Success")
            return None  # comportamento real: None + sucesso quando não há posições
        return tuple(items)

    def orders_get(self, symbol: str | None = None) -> tuple | None:
        if not self.connected:
            self.drop_connection()
            return None
        return ()

    # -- helpers de teste
    def set_rates(self, symbol: str, timeframe: int, rows: list[tuple]) -> None:
        self.rates[(symbol, timeframe)] = np.array(rows, dtype=RATE_DTYPE)

    def set_tick(self, symbol: str, server_epoch: float, bid: float, ask: float, last: float | None = None) -> None:
        self.ticks[symbol] = TickInfo(
            time=int(server_epoch), bid=bid, ask=ask, last=last if last is not None else bid,
            volume=1, time_msc=int(server_epoch * 1000), flags=0, volume_real=1.0,
        )
