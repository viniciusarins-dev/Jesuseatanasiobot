from __future__ import annotations

from datetime import timedelta

from app.core.errors import MT5ConnectionError
from app.core.types import Tick
from app.data.tick_manager import TickManager
from tests.conftest import SYMBOL, local_dt

NOW = local_dt(2026, 9, 1, 10, 7, 30)


class StubSource:
    def __init__(self, tick=None, error=None):
        self.tick, self.error = tick, error

    def last_tick(self, symbol):
        if self.error:
            raise self.error
        return self.tick

    def copy_ticks_range(self, symbol, start, end):  # pragma: no cover
        raise NotImplementedError


def _manager(tick=None, error=None, now=NOW):
    return TickManager(StubSource(tick, error), SYMBOL, max_tick_age_seconds=30, clock_tolerance_seconds=120, clock=lambda: now)


def _tick(age_s=1.0, bid=120_000.0, ask=120_005.0):
    return Tick(time=NOW - timedelta(seconds=age_s), bid=bid, ask=ask, last=bid, volume=1)


def _codes(status):
    return {i.code for i in status.issues}


def test_fresh_tick_provides_server_clock():
    status = _manager(_tick(2)).status()
    assert status.fresh
    assert status.server_now == NOW - timedelta(seconds=2)


def test_stale_tick_is_not_fresh():
    status = _manager(_tick(45)).status()
    assert not status.fresh and "stale_tick" in _codes(status)
    assert status.server_now is None


def test_tick_in_future_flags_clock_skew_and_suggests_offset():
    status = _manager(_tick(-3 * 3600)).status()
    assert "clock_skew" in _codes(status)
    assert status.suggested_offset_correction_hours == -3


def test_no_tick():
    assert "no_tick" in _codes(_manager(None).status())


def test_connection_error_becomes_issue_not_exception():
    status = _manager(error=MT5ConnectionError("caiu")).status()
    assert not status.fresh and "tick_unavailable" in _codes(status)


def test_invalid_quotes():
    assert "no_quote" in _codes(_manager(_tick(bid=0.0)).status())
    assert "crossed_quote" in _codes(_manager(_tick(bid=120_010.0, ask=120_000.0)).status())
