"""Cliente MetaTrader 5 — ÚNICO módulo do projeto que conhece a biblioteca ``MetaTrader5``.

* Import LAZY (``importlib``) para que o restante do sistema e os testes rodem
  sem MT5 / fora do Windows. Em testes, injete ``library=FakeMT5()``.
* Converte tudo para tipos de domínio (``app.core.types``) com horários em UTC.
* Chamadas serializadas por lock: a biblioteca oficial não é thread-safe.
* Credenciais nunca aparecem em logs nem em mensagens de exceção.

FASE 1: somente leitura. Este cliente NÃO possui nenhuma função de envio,
modificação ou cancelamento de ordens.
"""

from __future__ import annotations

import importlib
import logging
import threading
from datetime import datetime
from typing import Any

import pandas as pd

from app.config.settings import Secret
from app.core.enums import AccountMarginMode, Side, SymbolTradeMode, Timeframe
from app.core.errors import MT5ConnectionError, MT5DataError, MT5UnavailableError
from app.core.types import (
    AccountSnapshot,
    DealSnapshot,
    OrderSnapshot,
    PositionSnapshot,
    SymbolSpec,
    TerminalSnapshot,
    Tick,
)
from app.utils import time_utils
from app.utils.logger import ctx

logger = logging.getLogger(__name__)

_LIBRARY_NAME = "MetaTrader5"
_RES_S_OK = 1  # código de sucesso do last_error() do MT5
RATE_COLUMNS = ("time", "open", "high", "low", "close", "tick_volume", "spread", "real_volume")


def load_mt5_library() -> Any:
    try:
        return importlib.import_module(_LIBRARY_NAME)
    except ImportError as exc:
        raise MT5UnavailableError(
            "Biblioteca MetaTrader5 indisponível. Ela só funciona no Windows com o "
            "terminal MT5 instalado: pip install MetaTrader5"
        ) from exc


class MT5Client:
    def __init__(
        self,
        *,
        server_utc_offset_hours: float | None,
        login: int | None = None,
        password: Secret | None = None,
        server: str | None = None,
        terminal_path: str | None = None,
        timeout_ms: int = 60_000,
        library: Any | None = None,
    ) -> None:
        self._offset = server_utc_offset_hours
        self._login = login
        self._password = password or Secret(None)
        self._server = server
        self._terminal_path = terminal_path
        self._timeout_ms = timeout_ms
        self._library = library
        self._lock = threading.RLock()
        self._initialized = False

    def __repr__(self) -> str:  # nunca expõe credenciais
        return f"MT5Client(initialized={self._initialized})"

    # ------------------------------------------------------------------ conexão

    @property
    def _mt5(self) -> Any:
        if self._library is None:
            self._library = load_mt5_library()
        return self._library

    def _last_error(self) -> tuple[int | None, str]:
        try:
            code, message = self._mt5.last_error()
            return int(code), str(message)
        except Exception:  # noqa: BLE001 - diagnóstico best-effort
            return None, "erro desconhecido"

    def connect(self) -> AccountSnapshot:
        """Inicializa o terminal, faz login (se configurado) e confirma a conta."""
        with self._lock:
            kwargs: dict[str, Any] = {"timeout": self._timeout_ms}
            if self._terminal_path:
                kwargs["path"] = self._terminal_path
            if self._login is not None:
                kwargs["login"] = self._login
                kwargs["password"] = self._password.reveal() or ""
                if self._server:
                    kwargs["server"] = self._server
            elif self._password.is_set():
                logger.warning("MT5_PASSWORD definido sem MT5_LOGIN: credenciais ignoradas")

            if not self._mt5.initialize(**kwargs):
                code, message = self._last_error()
                self._safe_shutdown()
                raise MT5ConnectionError(f"Falha ao inicializar o MT5: {message}", code)
            self._initialized = True

            terminal = self.terminal()
            if not terminal.connected:
                self._safe_shutdown()
                raise MT5ConnectionError("Terminal MT5 iniciado mas sem conexão com o servidor")
            account = self.account()
            if self._login is not None and account.login != self._login:
                self._safe_shutdown()
                raise MT5ConnectionError("A conta conectada no terminal difere de MT5_LOGIN")

        logger.info(
            "MT5 conectado",
            extra=ctx(
                build=terminal.build,
                terminal_trade_allowed=terminal.trade_allowed,
                account_trade_allowed=account.trade_allowed,
                margin_mode=account.margin_mode.value,
                currency=account.currency,
            ),
        )
        return account

    def reconnect(self) -> AccountSnapshot:
        with self._lock:
            self._safe_shutdown()
            return self.connect()

    def shutdown(self) -> None:
        with self._lock:
            was_initialized = self._initialized
            self._safe_shutdown()
        if was_initialized:
            logger.info("MT5 desconectado (shutdown)")

    def _safe_shutdown(self) -> None:
        try:
            if self._library is not None:
                self._library.shutdown()
        except Exception:  # noqa: BLE001
            logger.exception("Erro ao encerrar o MT5")
        finally:
            self._initialized = False

    def is_connected(self) -> bool:
        if not self._initialized:
            return False
        with self._lock:
            try:
                info = self._mt5.terminal_info()
            except Exception:  # noqa: BLE001
                return False
            return bool(info is not None and info.connected)

    def _call(self, func_name: str, *args: Any, empty_ok: bool = False, **kwargs: Any) -> Any:
        """Chama a biblioteca; ``None`` vira exceção tipada (conexão vs. dados).

        ``empty_ok``: para consultas de lista (posições/ordens/deals), ``None`` com
        ``last_error`` de sucesso significa "nenhum item", não falha.
        """
        if not self._initialized:
            raise MT5ConnectionError("MT5 não inicializado")
        with self._lock:
            try:
                result = getattr(self._mt5, func_name)(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 - a lib pode lançar erros arbitrários
                raise MT5ConnectionError(f"Exceção em {func_name}: {exc}") from exc
            if result is None:
                code, message = self._last_error()
                if empty_ok and code == _RES_S_OK:
                    return ()
                info = self._mt5.terminal_info()
                if info is None or not info.connected:
                    raise MT5ConnectionError(f"{func_name}: terminal desconectado ({message})", code)
                raise MT5DataError(f"{func_name} retornou vazio: {message}", code)
            return result

    # ------------------------------------------------------------------ conta/terminal

    def terminal(self) -> TerminalSnapshot:
        info = self._call("terminal_info")
        return TerminalSnapshot(
            connected=bool(info.connected),
            trade_allowed=bool(info.trade_allowed),
            build=int(info.build),
        )

    def account(self) -> AccountSnapshot:
        info = self._call("account_info")
        return AccountSnapshot(
            login=int(info.login),
            server=str(info.server),
            currency=str(info.currency),
            balance=float(info.balance),
            equity=float(info.equity),
            margin_mode=self._margin_mode(int(info.margin_mode)),
            trade_allowed=bool(info.trade_allowed),
            trade_expert=bool(info.trade_expert),
        )

    def _margin_mode(self, code: int) -> AccountMarginMode:
        mapping = {
            getattr(self._mt5, "ACCOUNT_MARGIN_MODE_RETAIL_NETTING", None): AccountMarginMode.RETAIL_NETTING,
            getattr(self._mt5, "ACCOUNT_MARGIN_MODE_EXCHANGE", None): AccountMarginMode.EXCHANGE,
            getattr(self._mt5, "ACCOUNT_MARGIN_MODE_RETAIL_HEDGING", None): AccountMarginMode.RETAIL_HEDGING,
        }
        return mapping.get(code, AccountMarginMode.UNKNOWN)

    # ------------------------------------------------------------------ símbolo

    def symbol_spec(self, symbol: str) -> SymbolSpec | None:
        """Especificação do símbolo, ou ``None`` se ele não existir na corretora."""
        try:
            info = self._call("symbol_info", symbol)
        except MT5DataError:
            return None
        expiration = int(getattr(info, "expiration_time", 0) or 0)
        return SymbolSpec(
            name=str(info.name),
            description=str(getattr(info, "description", "")),
            visible=bool(info.visible),
            selected=bool(info.select),
            trade_mode=self._trade_mode(int(info.trade_mode)),
            volume_min=float(info.volume_min),
            volume_max=float(info.volume_max),
            volume_step=float(info.volume_step),
            tick_size=float(info.trade_tick_size),
            tick_value=float(info.trade_tick_value),
            filling_mode=int(info.filling_mode),
            stops_level=int(info.trade_stops_level),
            digits=int(info.digits),
            currency_profit=str(getattr(info, "currency_profit", "")),
            expiration_time=(
                time_utils.server_epoch_to_utc(expiration, self._offset) if expiration > 0 else None
            ),
        )

    def _trade_mode(self, code: int) -> SymbolTradeMode:
        mapping = {
            getattr(self._mt5, "SYMBOL_TRADE_MODE_DISABLED", None): SymbolTradeMode.DISABLED,
            getattr(self._mt5, "SYMBOL_TRADE_MODE_LONGONLY", None): SymbolTradeMode.LONG_ONLY,
            getattr(self._mt5, "SYMBOL_TRADE_MODE_SHORTONLY", None): SymbolTradeMode.SHORT_ONLY,
            getattr(self._mt5, "SYMBOL_TRADE_MODE_CLOSEONLY", None): SymbolTradeMode.CLOSE_ONLY,
            getattr(self._mt5, "SYMBOL_TRADE_MODE_FULL", None): SymbolTradeMode.FULL,
        }
        return mapping.get(code, SymbolTradeMode.UNKNOWN)

    def select_symbol(self, symbol: str) -> bool:
        """Adiciona o símbolo ao Market Watch (necessário para receber cotações)."""
        try:
            return bool(self._call("symbol_select", symbol, True))
        except MT5DataError:
            return False

    # ------------------------------------------------------------------ candles/ticks

    def _timeframe_constant(self, timeframe: Timeframe) -> int:
        return int(getattr(self._mt5, f"TIMEFRAME_{timeframe.value}"))

    def _rates_frame(self, array: Any) -> pd.DataFrame:
        df = pd.DataFrame(array)
        if df.empty:
            return pd.DataFrame(columns=list(RATE_COLUMNS))
        missing = [c for c in RATE_COLUMNS if c not in df.columns]
        if missing:
            raise MT5DataError(f"Candles sem colunas obrigatórias: {missing}")
        df = df.loc[:, list(RATE_COLUMNS)].copy()
        df["time"] = time_utils.server_epochs_to_utc(df["time"], self._offset)
        return df.reset_index(drop=True)

    def copy_rates(self, symbol: str, timeframe: Timeframe, count: int, start_pos: int = 0) -> pd.DataFrame:
        """Últimos ``count`` candles (INCLUI o candle em formação — filtrar no CandleManager).

        Retorna colunas ``RATE_COLUMNS`` com ``time`` = abertura do candle em UTC.
        """
        array = self._call("copy_rates_from_pos", symbol, self._timeframe_constant(timeframe), start_pos, count)
        return self._rates_frame(array)

    def copy_rates_range(
        self, symbol: str, timeframe: Timeframe, start_utc: datetime, end_utc: datetime
    ) -> pd.DataFrame:
        array = self._call(
            "copy_rates_range",
            symbol,
            self._timeframe_constant(timeframe),
            time_utils.utc_to_server_naive(start_utc, self._offset),
            time_utils.utc_to_server_naive(end_utc, self._offset),
        )
        return self._rates_frame(array)

    def last_tick(self, symbol: str) -> Tick | None:
        try:
            tick = self._call("symbol_info_tick", symbol)
        except MT5DataError:
            return None
        time_msc = int(getattr(tick, "time_msc", 0) or 0)
        epoch = time_msc / 1000 if time_msc > 0 else int(tick.time)
        return Tick(
            time=time_utils.server_epoch_to_utc(epoch, self._offset),
            bid=float(tick.bid),
            ask=float(tick.ask),
            last=float(tick.last),
            volume=float(getattr(tick, "volume_real", 0) or tick.volume),
        )

    def copy_ticks_range(self, symbol: str, start_utc: datetime, end_utc: datetime) -> pd.DataFrame:
        array = self._call(
            "copy_ticks_range",
            symbol,
            time_utils.utc_to_server_naive(start_utc, self._offset),
            time_utils.utc_to_server_naive(end_utc, self._offset),
            int(self._mt5.COPY_TICKS_ALL),
        )
        df = pd.DataFrame(array)
        if df.empty:
            return pd.DataFrame(columns=["time", "bid", "ask", "last", "volume", "flags"])
        if "time_msc" in df.columns:
            df["time"] = time_utils.server_epochs_ms_to_utc(df["time_msc"], self._offset)
        else:
            df["time"] = time_utils.server_epochs_to_utc(df["time"], self._offset)
        if "volume_real" in df.columns:
            df["volume"] = df["volume_real"]
        return df.loc[:, ["time", "bid", "ask", "last", "volume", "flags"]].reset_index(drop=True)

    # ------------------------------------------------------------------ posições/ordens/deals

    def _side(self, code: int, buy_const: str, sell_const: str) -> Side:
        if code == getattr(self._mt5, buy_const, None):
            return Side.BUY
        if code == getattr(self._mt5, sell_const, None):
            return Side.SELL
        return Side.OTHER

    def positions(self, symbol: str | None = None) -> list[PositionSnapshot]:
        raw = (
            self._call("positions_get", symbol=symbol, empty_ok=True)
            if symbol
            else self._call("positions_get", empty_ok=True)
        )
        return [
            PositionSnapshot(
                ticket=int(p.ticket),
                symbol=str(p.symbol),
                side=self._side(int(p.type), "POSITION_TYPE_BUY", "POSITION_TYPE_SELL"),
                volume=float(p.volume),
                price_open=float(p.price_open),
                sl=float(p.sl),
                tp=float(p.tp),
                magic=int(p.magic),
                comment=str(p.comment),
                time=time_utils.server_epoch_to_utc(int(p.time), self._offset),
            )
            for p in raw
        ]

    def orders(self, symbol: str | None = None) -> list[OrderSnapshot]:
        raw = (
            self._call("orders_get", symbol=symbol, empty_ok=True)
            if symbol
            else self._call("orders_get", empty_ok=True)
        )
        return [
            OrderSnapshot(
                ticket=int(o.ticket),
                symbol=str(o.symbol),
                type_code=int(o.type),
                volume=float(o.volume_current),
                price_open=float(o.price_open),
                sl=float(o.sl),
                tp=float(o.tp),
                magic=int(o.magic),
                comment=str(o.comment),
                time_setup=time_utils.server_epoch_to_utc(int(o.time_setup), self._offset),
            )
            for o in raw
        ]

    def deals(self, start_utc: datetime, end_utc: datetime) -> list[DealSnapshot]:
        raw = self._call(
            "history_deals_get",
            time_utils.utc_to_server_naive(start_utc, self._offset),
            time_utils.utc_to_server_naive(end_utc, self._offset),
            empty_ok=True,
        )
        return [
            DealSnapshot(
                ticket=int(d.ticket),
                order=int(d.order),
                position_id=int(d.position_id),
                symbol=str(d.symbol),
                side=self._side(int(d.type), "DEAL_TYPE_BUY", "DEAL_TYPE_SELL"),
                entry_code=int(d.entry),
                volume=float(d.volume),
                price=float(d.price),
                profit=float(d.profit),
                commission=float(d.commission),
                fee=float(getattr(d, "fee", 0.0)),
                magic=int(d.magic),
                comment=str(d.comment),
                time=time_utils.server_epoch_to_utc(int(d.time), self._offset),
            )
            for d in raw
        ]
