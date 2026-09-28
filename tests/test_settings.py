from __future__ import annotations

import logging

import pytest

import yaml

from app.config.settings import Secret, load_settings, require, settings_from_dict
from app.core.enums import Mode, Timeframe, VolumeType
from app.core.errors import ConfigError, MissingConfigValue
from tests.conftest import ROOT


def test_repository_config_loads_with_placeholders_as_none():
    settings = load_settings(ROOT / "config.yaml", env_path=None)
    assert settings.market.symbol is None
    assert settings.market.tick_size is None
    assert settings.costs.brokerage_per_contract is None
    assert settings.execution.mode is Mode.PAPER
    assert settings.execution.allow_real_orders is False
    assert settings.execution.max_contracts == 1


def test_parsed_types(settings):
    assert settings.market.timeframe is Timeframe.M5
    assert settings.market.volume_type is VolumeType.REAL
    assert settings.market.server_utc_offset_hours == -3.0
    assert settings.session.signal_start.hour == 9 and settings.session.signal_start.minute == 10


def test_require_reports_missing_value():
    with pytest.raises(MissingConfigValue, match="CONFIGURÁVEL: 'costs.brokerage_per_contract'"):
        require(None, "costs.brokerage_per_contract", "corretagem por contrato")
    assert require(5, "x", "y") == 5


def test_max_contracts_above_hard_limit_aborts(raw_config):
    raw_config["execution"]["max_contracts"] = 2
    with pytest.raises(ConfigError, match="limite absoluto"):
        settings_from_dict(raw_config)


def test_zero_contracts_rejected(raw_config):
    raw_config["execution"]["max_contracts"] = 0
    with pytest.raises(ConfigError):
        settings_from_dict(raw_config)


def test_live_execution_without_allow_real_orders_aborts(raw_config):
    raw_config["execution"]["mode"] = "LIVE_EXECUTION"
    raw_config["execution"]["allow_real_orders"] = False
    with pytest.raises(ConfigError, match="contraditória"):
        settings_from_dict(raw_config)


def test_allow_real_orders_outside_live_only_warns(raw_config, caplog):
    raw_config["execution"]["allow_real_orders"] = True
    with caplog.at_level(logging.WARNING):
        settings = settings_from_dict(raw_config)
    assert settings.execution.mode is Mode.PAPER
    assert "nunca envia ordens reais" in caplog.text


@pytest.mark.parametrize(
    ("section", "key", "value"),
    [
        ("strategy", "fast_ma", "abc"),
        ("strategy", "fast_ma", 9.5),
        ("strategy", "use_vwap_filter", "yes"),
        ("strategy", "fast_ma", True),
        ("risk", "risk_per_trade", 1.5),
        ("risk", "stop_points", -10),
        ("market", "timeframe", "H1"),
        ("market", "timezone", "Mars/Olympus"),
        ("execution", "mode", "REAL"),
        ("execution", "opposite_signal_policy", "reverse"),
        ("execution", "on_missing_protection", "ignore"),
        ("backtest", "intrabar_conflict", "best_case"),
        ("tax", "day_trade_rate", 1.2),
        ("session", "signal_start", "9h10"),
    ],
)
def test_invalid_values_rejected(raw_config, section, key, value):
    raw_config[section][key] = value
    with pytest.raises(ConfigError):
        settings_from_dict(raw_config)


def test_fast_ma_must_be_smaller_than_slow(raw_config):
    raw_config["strategy"]["fast_ma"] = 30
    with pytest.raises(ConfigError, match="fast_ma"):
        settings_from_dict(raw_config)


def test_session_order_enforced(raw_config):
    raw_config["session"]["signal_end"] = "18:00"
    with pytest.raises(ConfigError, match="Sessão inválida"):
        settings_from_dict(raw_config)


def test_missing_required_key(raw_config):
    del raw_config["risk"]["max_daily_loss"]
    with pytest.raises(ConfigError, match="risk.max_daily_loss"):
        settings_from_dict(raw_config)


def test_secret_never_revealed_in_repr():
    secret = Secret("super-senha")
    assert "super-senha" not in repr(secret)
    assert "super-senha" not in str(secret)
    assert secret.reveal() == "super-senha"


def test_credentials_from_env_file(tmp_path, raw_config):
    env = tmp_path / ".env"
    env.write_text(
        "MT5_LOGIN=998877\nMT5_PASSWORD=pw-123456\nMT5_SERVER=Broker-Real\n"
        "TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmnoPQRstuVWXyz0123456789\nTELEGRAM_CHAT_ID=55555\n",
        encoding="utf-8",
    )
    cfg = tmp_path / "config.yaml"
    cfg.write_text(yaml.safe_dump(raw_config), encoding="utf-8")
    settings = load_settings(cfg, env)
    creds = settings.credentials
    assert creds.mt5_login == 998877
    assert creds.mt5_password.reveal() == "pw-123456"
    text = repr(creds)
    for sensitive in ("998877", "pw-123456", "Broker-Real", "ABCdef", "55555"):
        assert sensitive not in text
    assert set(creds.secret_values()) >= {"pw-123456", "998877", "55555"}


def test_non_numeric_login_error_does_not_leak_value(tmp_path, raw_config):
    env = tmp_path / ".env"
    env.write_text("MT5_LOGIN=meu-login-secreto\n", encoding="utf-8")
    cfg = tmp_path / "config.yaml"
    cfg.write_text(yaml.safe_dump(raw_config), encoding="utf-8")
    with pytest.raises(ConfigError) as info:
        load_settings(cfg, env)
    assert "meu-login-secreto" not in str(info.value)


def test_missing_config_file():
    with pytest.raises(ConfigError, match="não encontrado"):
        load_settings("nao-existe.yaml", env_path=None)
