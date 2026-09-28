from __future__ import annotations

from datetime import datetime

import pytest

from app.core.enums import Timeframe, VolumeType
from app.data.candle_manager import CandleManager, InMemoryStateStore, closed_candles
from app.data.mt5_client import MT5Client
from app.data.tick_manager import TickManager
from tests.conftest import OFFSET, SP, SYMBOL, local_dt, make_df, make_rows, server_epoch

START = local_dt(2026, 9, 1, 10, 0)  # candles 10:00, 10:05, ..., 10:20 (5 candles)


class Clock:
    def __init__(self, now: datetime):
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def env(fake_mt5):
    fake_mt5.set_rates(SYMBOL, fake_mt5.TIMEFRAME_M5, make_rows(START, 5))
    client = MT5Client(server_utc_offset_hours=OFFSET, library=fake_mt5)
    client.connect()
    clock = Clock(local_dt(2026, 9, 1, 10, 22))  # candle das 10:20 ainda em formação
    fake_mt5.set_tick(SYMBOL, server_epoch(clock.now), 120_000, 120_005)
    ticks = TickManager(client, SYMBOL, 30, 120, clock=clock)
    state = InMemoryStateStore()

    def build(block_on_gaps=True, history_bars=4):
        return CandleManager(client, ticks, SYMBOL, Timeframe.M5, SP, VolumeType.REAL, history_bars, block_on_gaps, state)

    return fake_mt5, clock, build, state


def test_closed_candles_pure_function():
    df = make_df(START, 3)  # 10:00, 10:05, 10:10
    assert len(closed_candles(df, local_dt(2026, 9, 1, 10, 14, 59), Timeframe.M5)) == 2
    # exatamente no fechamento o candle conta como fechado
    assert len(closed_candles(df, local_dt(2026, 9, 1, 10, 15), Timeframe.M5)) == 3


def test_snapshot_excludes_forming_candle(env):
    _, _, build, _ = env
    snap = build().snapshot()
    assert snap.usable, snap.reasons
    assert snap.last_closed_time == local_dt(2026, 9, 1, 10, 15)
    assert local_dt(2026, 9, 1, 10, 20) not in set(snap.candles["time"].dt.to_pydatetime())
    assert "volume" in snap.candles.columns
    assert (snap.candles["volume"] == snap.candles["real_volume"]).all()


def test_new_candle_detection_survives_via_state_store(env):
    fake, clock, build, state = env
    manager = build()
    snap = manager.snapshot()
    assert snap.is_new
    manager.mark_processed(snap.last_closed_time)
    assert not manager.snapshot().is_new
    # "reinício": novo manager com o mesmo store não reprocessa
    assert not build().snapshot().is_new
    # tempo avança: candle das 10:20 fecha
    clock.now = local_dt(2026, 9, 1, 10, 25, 1)
    fake.set_tick(SYMBOL, server_epoch(clock.now), 120_000, 120_005)
    snap = manager.snapshot()
    assert snap.is_new and snap.last_closed_time == local_dt(2026, 9, 1, 10, 20)


def test_stale_tick_makes_snapshot_unusable_and_empty(env):
    fake, clock, build, _ = env
    clock.now = local_dt(2026, 9, 1, 10, 30)  # tick ficou 8 minutos para trás
    snap = build().snapshot()
    assert not snap.usable
    assert snap.candles.empty
    assert "no_server_clock" in snap.reasons


def test_gap_blocks_when_configured(env):
    fake, _, build, _ = env
    rows = make_rows(START, 5)
    fake.set_rates(SYMBOL, fake.TIMEFRAME_M5, [rows[0], rows[3], rows[4]])
    assert not build(block_on_gaps=True).snapshot().usable
    snap = build(block_on_gaps=False).snapshot()
    assert snap.usable and any(i.code == "gap" for i in snap.issues)


def test_invalid_data_unusable(env):
    fake, _, build, _ = env
    rows = [list(r) for r in make_rows(START, 5)]
    rows[1][2] = 1.0  # high absurdo
    fake.set_rates(SYMBOL, fake.TIMEFRAME_M5, [tuple(r) for r in rows])
    snap = build().snapshot()
    assert not snap.usable and "ohlc_incoherent" in snap.reasons


def test_connection_loss_unusable_without_exception(env):
    fake, _, build, _ = env
    fake.drop_connection()
    snap = build().snapshot()
    assert not snap.usable and snap.candles.empty
