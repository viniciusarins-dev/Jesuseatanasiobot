from __future__ import annotations

from datetime import date, datetime, time, timezone

import pandas as pd
import pytest

from app.core.errors import MissingConfigValue
from app.utils import time_utils as tu
from tests.conftest import SP, local_dt, server_epoch

UTC = timezone.utc


def test_server_epoch_to_utc_applies_offset():
    # Servidor em UTC-3 marca 10:00 → UTC real 13:00
    wall_10h = int(datetime(2026, 9, 1, 10, 0, tzinfo=UTC).timestamp())
    assert tu.server_epoch_to_utc(wall_10h, -3) == datetime(2026, 9, 1, 13, 0, tzinfo=UTC)
    # Servidor em UTC+3 marca 16:00 → UTC real 13:00
    wall_16h = int(datetime(2026, 9, 1, 16, 0, tzinfo=UTC).timestamp())
    assert tu.server_epoch_to_utc(wall_16h, 3) == datetime(2026, 9, 1, 13, 0, tzinfo=UTC)


def test_vectorized_matches_scalar():
    epochs = pd.Series([server_epoch(local_dt(2026, 9, 1, 10, m)) for m in (0, 5, 10)])
    out = tu.server_epochs_to_utc(epochs, -3)
    assert str(out.dtype) == "datetime64[ns, UTC]"
    assert out.iloc[0].to_pydatetime() == local_dt(2026, 9, 1, 10, 0)
    ms = tu.server_epochs_ms_to_utc(epochs * 1000, -3)
    assert (ms == out).all()


def test_missing_offset_is_configurable_error():
    with pytest.raises(MissingConfigValue, match="server_utc_offset_hours"):
        tu.server_epoch_to_utc(0, None)


def test_utc_to_server_roundtrip():
    real = local_dt(2026, 9, 1, 10, 0)
    wall = tu.utc_to_server_naive(real, -3)
    assert tu.server_epoch_to_utc(wall.timestamp(), -3) == real


def test_naive_datetime_rejected():
    with pytest.raises(ValueError):
        tu.ensure_utc(datetime(2026, 9, 1, 10, 0))


def test_trading_date_uses_market_timezone():
    # 01:30 UTC de 02/09 ainda é 01/09 em São Paulo
    assert tu.trading_date(datetime(2026, 9, 2, 1, 30, tzinfo=UTC), SP) == date(2026, 9, 1)


def test_is_within_is_half_open():
    assert tu.is_within(time(9, 10), time(9, 10), time(17, 30))
    assert not tu.is_within(time(17, 30), time(9, 10), time(17, 30))


def test_local_session_bounds_to_utc():
    start, end = tu.local_session_bounds(date(2026, 9, 1), time(9, 0), time(18, 0), SP)
    assert start == datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    assert end == datetime(2026, 9, 1, 21, 0, tzinfo=UTC)
