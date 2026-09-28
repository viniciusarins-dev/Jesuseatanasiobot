from __future__ import annotations

import pandas as pd
import pytest

from app.core.enums import Severity, Timeframe, VolumeType
from app.data.validation import validate_candles
from tests.conftest import SP, local_dt, make_df

TF = Timeframe.M5


def _validate(df, now=None, volume_type=VolumeType.REAL):
    return validate_candles(df, TF, SP, volume_type, now_utc=now)


def _codes(result, severity=None):
    return {i.code for i in result.issues if severity is None or i.severity is severity}


def test_valid_candles_pass():
    result = _validate(make_df(local_dt(2026, 9, 1, 10, 0), 20))
    assert result.ok
    assert result.issues == ()
    assert not result.has_gaps


def test_missing_columns():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 3).drop(columns=["real_volume"])
    assert "missing_columns" in _codes(_validate(df), Severity.ERROR)


def test_empty():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 1).iloc[0:0]
    assert "empty" in _codes(_validate(df), Severity.ERROR)


def test_naive_time_rejected():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 3)
    df["time"] = df["time"].dt.tz_localize(None)
    assert "time_not_utc" in _codes(_validate(df), Severity.ERROR)


def test_nan_rejected():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 3)
    df.loc[1, "close"] = float("nan")
    assert "missing_values" in _codes(_validate(df), Severity.ERROR)


def test_unsorted_is_reordered_with_warning():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 5).iloc[::-1].reset_index(drop=True)
    result = _validate(df)
    assert result.ok
    assert "unsorted" in _codes(result, Severity.WARNING)
    assert result.candles["time"].is_monotonic_increasing


def test_exact_duplicate_removed_with_warning():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 5)
    df = pd.concat([df, df.iloc[[2]]]).sort_values("time").reset_index(drop=True)
    result = _validate(df)
    assert result.ok
    assert "duplicate_exact" in _codes(result, Severity.WARNING)
    assert len(result.candles) == 5


def test_conflicting_duplicate_is_error():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 5)
    dup = df.iloc[[2]].copy()
    dup["close"] += 5
    df = pd.concat([df, dup]).sort_values("time", kind="stable").reset_index(drop=True)
    assert "duplicate_conflict" in _codes(_validate(df), Severity.ERROR)


def test_misaligned_timestamp():
    df = make_df(local_dt(2026, 9, 1, 10, 1), 3)
    assert "misaligned_timestamp" in _codes(_validate(df), Severity.ERROR)


def test_future_timestamp():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 5)
    assert "future_timestamp" in _codes(_validate(df, now=local_dt(2026, 9, 1, 10, 5)), Severity.ERROR)


def test_epoch_zero_invalid():
    df = make_df(pd.Timestamp(0, tz="UTC").to_pydatetime(), 2)
    assert "invalid_timestamp" in _codes(_validate(df), Severity.ERROR)


@pytest.mark.parametrize(
    ("column", "value", "code"),
    [
        ("high", 100.0, "ohlc_incoherent"),       # high abaixo do corpo
        ("low", 999_999.0, "ohlc_incoherent"),    # low acima do corpo
        ("open", 0.0, "non_positive_price"),
        ("real_volume", -1, "negative_volume"),
    ],
)
def test_ohlcv_errors(column, value, code):
    df = make_df(local_dt(2026, 9, 1, 10, 0), 5)
    df.loc[2, column] = value
    assert code in _codes(_validate(df), Severity.ERROR)


def test_selected_volume_all_zero_is_error():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 5)
    df["real_volume"] = 0
    assert "volume_unavailable" in _codes(_validate(df, volume_type=VolumeType.REAL), Severity.ERROR)
    assert _validate(df, volume_type=VolumeType.TICK).ok


def test_intraday_gap_detected_with_missing_count():
    df = make_df(local_dt(2026, 9, 1, 10, 0), 10)
    df = df.drop(index=[4, 5, 6]).reset_index(drop=True)
    result = _validate(df)
    assert result.ok  # gap é WARNING; o bloqueio é decidido no CandleManager
    assert result.has_gaps
    assert result.gaps[0].missing_bars == 3
    assert "gap" in _codes(result, Severity.WARNING)


def test_overnight_is_not_a_gap():
    day1 = make_df(local_dt(2026, 9, 1, 17, 50), 2)
    day2 = make_df(local_dt(2026, 9, 2, 9, 0), 2)
    result = _validate(pd.concat([day1, day2], ignore_index=True))
    assert result.ok
    assert not result.has_gaps
