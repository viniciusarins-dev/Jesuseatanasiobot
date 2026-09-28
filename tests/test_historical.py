from __future__ import annotations

import json

import pandas as pd
import pytest

from app.core.enums import Timeframe, VolumeType
from app.core.errors import DataValidationError
from app.data.historical import export_from_mt5, load_csv, meta_path
from app.data.mt5_client import MT5Client
from tests.conftest import OFFSET, SP, SYMBOL, local_dt, make_rows


@pytest.fixture
def exported(tmp_path, fake_mt5):
    fake_mt5.set_rates(SYMBOL, fake_mt5.TIMEFRAME_M5, make_rows(local_dt(2026, 9, 1, 10, 0), 10))
    client = MT5Client(server_utc_offset_hours=OFFSET, library=fake_mt5)
    client.connect()
    path = tmp_path / "WIN_M5.csv"
    # fim às 10:47: o candle das 10:45 ainda está em formação e NÃO pode ser exportado
    rows = export_from_mt5(
        client, SYMBOL, Timeframe.M5, local_dt(2026, 9, 1, 9, 0), local_dt(2026, 9, 1, 10, 47), path, OFFSET
    )
    return path, rows


def test_export_excludes_forming_candle_and_writes_meta(exported):
    path, rows = exported
    assert rows == 9
    meta = json.loads(meta_path(path).read_text(encoding="utf-8"))
    assert meta["symbol"] == SYMBOL and meta["timeframe"] == "M5" and meta["server_utc_offset_hours"] == OFFSET


def test_roundtrip_load(exported):
    path, _ = exported
    result = load_csv(path, Timeframe.M5, SP, VolumeType.REAL, expected_symbol=SYMBOL)
    df = result.candles
    assert len(df) == 9
    assert str(df["time"].dtype) == "datetime64[ns, UTC]"
    assert df["time"].iloc[0].to_pydatetime() == local_dt(2026, 9, 1, 10, 0)


def test_meta_mismatch_rejected(exported):
    path, _ = exported
    with pytest.raises(DataValidationError, match="Timeframe"):
        load_csv(path, Timeframe.M1, SP, VolumeType.REAL)
    with pytest.raises(DataValidationError, match="Símbolo"):
        load_csv(path, Timeframe.M5, SP, VolumeType.REAL, expected_symbol="OUTRO")


def test_time_without_timezone_rejected(exported):
    path, _ = exported
    df = pd.read_csv(path)
    df["time"] = df["time"].str.replace("+00:00", "", regex=False)
    df.to_csv(path, index=False)
    with pytest.raises(DataValidationError, match="timezone"):
        load_csv(path, Timeframe.M5, SP, VolumeType.REAL)


def test_invalid_data_raises(exported):
    path, _ = exported
    df = pd.read_csv(path)
    df.loc[3, "high"] = 1.0
    df.to_csv(path, index=False)
    with pytest.raises(DataValidationError, match="ohlc_incoherent"):
        load_csv(path, Timeframe.M5, SP, VolumeType.REAL)


def test_missing_file_and_columns(tmp_path):
    with pytest.raises(DataValidationError, match="não encontrado"):
        load_csv(tmp_path / "x.csv", Timeframe.M5, SP, VolumeType.REAL)
    bad = tmp_path / "bad.csv"
    bad.write_text("time,open\n2026-09-01T13:00:00+00:00,1\n", encoding="utf-8")
    with pytest.raises(DataValidationError, match="colunas"):
        load_csv(bad, Timeframe.M5, SP, VolumeType.REAL)
