from __future__ import annotations

import importlib.util

import pytest

from app.config.settings import Secret
from app.core.enums import AccountMarginMode, Side, SymbolTradeMode, Timeframe
from app.core.errors import MT5ConnectionError, MT5UnavailableError
from app.data import mt5_client as mt5_module
from app.data.mt5_client import MT5Client, load_mt5_library
from tests.conftest import OFFSET, SYMBOL, local_dt, make_rows, server_epoch
from tests.fakes.fake_mt5 import Position


def _client(fake, **kwargs) -> MT5Client:
    return MT5Client(server_utc_offset_hours=OFFSET, library=fake, **kwargs)


def test_constructing_client_does_not_import_library():
    client = MT5Client(server_utc_offset_hours=OFFSET)
    assert client._library is None  # noqa: SLF001 - import lazy: só na primeira chamada
    assert not client.is_connected()


@pytest.mark.skipif(importlib.util.find_spec("MetaTrader5") is not None, reason="MetaTrader5 instalado")
def test_missing_library_raises_clear_error():
    with pytest.raises(MT5UnavailableError, match="Windows"):
        load_mt5_library()


def test_connect_passes_credentials_and_validates_account(fake_mt5):
    client = _client(fake_mt5, login=123456, password=Secret("pw-xyz"), server="Srv", terminal_path="C:/mt5.exe")
    account = client.connect()
    kwargs = fake_mt5.initialize_kwargs[-1]
    assert kwargs["login"] == 123456 and kwargs["password"] == "pw-xyz" and kwargs["server"] == "Srv"
    assert kwargs["path"] == "C:/mt5.exe"
    assert account.margin_mode is AccountMarginMode.EXCHANGE
    assert client.is_connected()
    assert "pw-xyz" not in repr(client) and "123456" not in repr(account)


def test_connect_without_credentials_uses_logged_terminal(fake_mt5):
    _client(fake_mt5).connect()
    assert "login" not in fake_mt5.initialize_kwargs[-1]


def test_connect_failure_raises(fake_mt5):
    fake_mt5.fail_initialize_times = 1
    with pytest.raises(MT5ConnectionError, match="No IPC"):
        _client(fake_mt5).connect()


def test_account_mismatch_aborts(fake_mt5):
    client = _client(fake_mt5, login=999, password=Secret("x"))
    with pytest.raises(MT5ConnectionError, match="difere"):
        client.connect()
    assert not client.is_connected()


def test_calls_before_connect_raise(fake_mt5):
    with pytest.raises(MT5ConnectionError):
        _client(fake_mt5).copy_rates(SYMBOL, Timeframe.M5, 10)


def test_copy_rates_converts_server_time_to_utc(fake_mt5):
    start = local_dt(2026, 9, 1, 10, 0)
    fake_mt5.set_rates(SYMBOL, fake_mt5.TIMEFRAME_M5, make_rows(start, 5))
    client = _client(fake_mt5)
    client.connect()
    df = client.copy_rates(SYMBOL, Timeframe.M5, 3)
    assert len(df) == 3
    assert str(df["time"].dtype) == "datetime64[ns, UTC]"
    assert df["time"].iloc[-1].to_pydatetime() == local_dt(2026, 9, 1, 10, 20)


def test_disconnect_during_call_raises_connection_error(fake_mt5):
    client = _client(fake_mt5)
    client.connect()
    fake_mt5.drop_connection()
    with pytest.raises(MT5ConnectionError):
        client.copy_rates(SYMBOL, Timeframe.M5, 3)
    assert not client.is_connected()


def test_last_tick_conversion(fake_mt5):
    now = local_dt(2026, 9, 1, 10, 7, 30)
    fake_mt5.set_tick(SYMBOL, server_epoch(now), bid=120_000, ask=120_005)
    client = _client(fake_mt5)
    client.connect()
    tick = client.last_tick(SYMBOL)
    assert tick.time == now and tick.bid == 120_000 and tick.ask == 120_005


def test_symbol_spec_mapping_and_missing_symbol(fake_mt5):
    client = _client(fake_mt5)
    client.connect()
    spec = client.symbol_spec(SYMBOL)
    assert spec.trade_mode is SymbolTradeMode.FULL
    assert spec.tick_size == 5.0 and spec.volume_step == 1.0
    assert spec.expiration_time is None
    assert client.symbol_spec("NAOEXISTE") is None


def test_positions_none_with_success_means_empty(fake_mt5):
    client = _client(fake_mt5)
    client.connect()
    assert client.positions(SYMBOL) == []
    fake_mt5.positions.append(
        Position(1, SYMBOL, 1, 1.0, 120_000.0, 120_100.0, 119_800.0, 777, "sk", server_epoch(local_dt(2026, 9, 1, 10, 0)))
    )
    positions = client.positions(SYMBOL)
    assert positions[0].side is Side.SELL and positions[0].magic == 777
    assert positions[0].time == local_dt(2026, 9, 1, 10, 0)


def test_phase1_client_has_no_order_capability():
    forbidden = ("order_send", "send_order", "order_check", "close_position", "open_position", "modify")
    names = [n for n in dir(MT5Client) if not n.startswith("__")]
    assert not [n for n in names if any(f in n for f in forbidden)]
    source = open(mt5_module.__file__, encoding="utf-8").read()
    assert "order_send" not in source
