from __future__ import annotations

from dataclasses import replace
from datetime import timedelta

import pytest

from app.core.enums import Severity
from app.data.mt5_client import MT5Client
from app.data.symbol_info import validate_symbol
from tests.conftest import OFFSET, SYMBOL, local_dt, server_epoch
from tests.fakes.fake_mt5 import default_symbol

NOW = local_dt(2026, 9, 1, 10, 0)


@pytest.fixture
def client(fake_mt5):
    c = MT5Client(server_utc_offset_hours=OFFSET, library=fake_mt5)
    c.connect()
    return c


def _codes(report, severity=None):
    return {i.code for i in report.issues if severity is None or i.severity is severity}


def test_valid_symbol(client, settings):
    report = validate_symbol(client, settings.market, require_trading=True, now=NOW)
    assert report.ok, report.summary()


def test_symbol_not_configured(client, settings):
    market = replace(settings.market, symbol=None)
    report = validate_symbol(client, market, require_trading=False)
    assert not report.ok and "symbol_not_configured" in _codes(report)


def test_symbol_not_found(client, settings):
    report = validate_symbol(client, replace(settings.market, symbol="WINX99"), require_trading=False)
    assert not report.ok and "symbol_not_found" in _codes(report)


def test_hidden_symbol_is_selected(client, fake_mt5, settings):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, visible=False, select=False)
    report = validate_symbol(client, settings.market, require_trading=True, now=NOW)
    assert report.ok and report.spec.selected


def test_hidden_symbol_select_fails(client, fake_mt5, settings):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, visible=False, select=False)
    fake_mt5.symbol_select_works = False
    report = validate_symbol(client, settings.market, require_trading=False, now=NOW)
    assert "symbol_not_selected" in _codes(report, Severity.ERROR)


def test_trade_disabled_blocks_only_when_trading_required(client, fake_mt5, settings):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, trade_mode=0)
    assert "trade_not_allowed" in _codes(validate_symbol(client, settings.market, True, NOW), Severity.ERROR)
    signal_only = validate_symbol(client, settings.market, False, NOW)
    assert signal_only.ok and "trade_not_allowed" in _codes(signal_only, Severity.WARNING)


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"volume_min": 0.0}, "volume_min_invalid"),
        ({"volume_max": 0.5}, "volume_max_invalid"),
        ({"volume_step": 0.0}, "volume_step_invalid"),
        ({"trade_tick_size": 1.0}, "tick_size_mismatch"),
        ({"trade_tick_value": 0.2}, "tick_value_mismatch"),
        ({"trade_tick_size": 0.0}, "tick_size_invalid"),
        ({"trade_stops_level": -1}, "stops_level_invalid"),
    ],
)
def test_spec_errors(client, fake_mt5, settings, overrides, code):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, **overrides)
    report = validate_symbol(client, settings.market, True, NOW)
    assert not report.ok and code in _codes(report, Severity.ERROR)


def test_tick_values_must_be_configured(client, settings):
    market = replace(settings.market, tick_size=None, tick_value=None)
    report = validate_symbol(client, market, False, NOW)
    assert {"tick_size_not_configured", "tick_value_not_configured"} <= _codes(report, Severity.ERROR)
    assert "CONFIGURÁVEL" in report.summary()


def test_tick_value_tolerance(client, fake_mt5, settings):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, trade_tick_value=1.004)
    assert not validate_symbol(client, settings.market, True, NOW).ok
    tolerant = replace(settings.market, tick_value_tolerance=0.01)
    assert validate_symbol(client, tolerant, True, NOW).ok


def test_expired_contract(client, fake_mt5, settings):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, expiration_time=server_epoch(NOW - timedelta(days=1)))
    assert "contract_expired" in _codes(validate_symbol(client, settings.market, False, NOW), Severity.ERROR)


def test_rollover_warning(client, fake_mt5, settings):
    fake_mt5.symbols[SYMBOL] = default_symbol(SYMBOL, expiration_time=server_epoch(NOW + timedelta(days=2)))
    report = validate_symbol(client, settings.market, True, NOW)
    assert report.ok and "rollover_soon" in _codes(report, Severity.WARNING)
