from __future__ import annotations

import pytest

from app.core.enums import ConnectionState
from app.core.errors import MT5ConnectionError, MT5UnavailableError
from app.data.mt5_client import MT5Client
from app.data.reconnect import BackoffPolicy, ConnectionSupervisor
from tests.conftest import OFFSET

POLICY = BackoffPolicy(initial_delay=1, factor=2, max_delay=5, max_attempts=4)


@pytest.fixture
def setup(fake_mt5):
    sleeps: list[float] = []
    client = MT5Client(server_utc_offset_hours=OFFSET, library=fake_mt5)
    return fake_mt5, client, sleeps


def test_backoff_is_progressive_and_capped():
    assert [POLICY.delay(n) for n in range(1, 6)] == [1, 2, 4, 5, 5]


def test_first_connection_without_wait(setup):
    fake, client, sleeps = setup
    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append)
    assert sup.ensure_connected()
    assert sup.state is ConnectionState.CONNECTED
    assert sleeps == []


def test_retries_with_backoff_then_succeeds(setup):
    fake, client, sleeps = setup
    fake.fail_initialize_times = 2
    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append)
    assert sup.ensure_connected()
    assert sleeps == [2, 4]  # tentativas 2 e 3


def test_exhausted_attempts_disconnected(setup):
    fake, client, sleeps = setup
    fake.fail_initialize_times = 99
    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append)
    assert not sup.ensure_connected()
    assert sup.state is ConnectionState.DISCONNECTED
    assert not sup.can_open_new_positions
    assert len(sleeps) == POLICY.max_attempts - 1


def test_reconnect_after_drop_requires_reconciliation(setup):
    fake, client, sleeps = setup
    callbacks: list[str] = []
    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append, on_reconnect=lambda: callbacks.append("x"))
    sup.ensure_connected()
    sup.mark_reconciled()
    assert sup.can_open_new_positions

    fake.drop_connection()
    assert sup.ensure_connected()
    assert sleeps == [1]  # após perda, espera antes de reconectar
    assert fake.calls.count("initialize") == 2
    assert sup.needs_reconciliation and not sup.can_open_new_positions
    assert callbacks == ["x", "x"]
    sup.mark_reconciled()
    assert sup.can_open_new_positions


def test_call_reconnects_and_retries_once(setup):
    fake, client, sleeps = setup
    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append)
    sup.ensure_connected()
    fake.drop_connection()
    assert sup.call(client.terminal).connected
    assert sup.state is ConnectionState.CONNECTED


def test_call_raises_when_reconnect_fails(setup):
    fake, client, sleeps = setup
    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append)
    sup.ensure_connected()
    fake.drop_connection()
    fake.fail_initialize_times = 99
    with pytest.raises(MT5ConnectionError):
        sup.call(client.terminal)
    assert sup.state is ConnectionState.DISCONNECTED


def test_missing_library_is_not_retried():
    class NoLib:
        def connect(self):
            raise MT5UnavailableError("sem lib")

        reconnect = connect

        def is_connected(self):
            return False

    sleeps: list[float] = []
    sup = ConnectionSupervisor(NoLib(), POLICY, sleep=sleeps.append)
    with pytest.raises(MT5UnavailableError):
        sup.ensure_connected()
    assert sleeps == []


def test_callback_error_does_not_break_supervisor(setup):
    fake, client, sleeps = setup

    def boom():
        raise RuntimeError("falha no callback")

    sup = ConnectionSupervisor(client, POLICY, sleep=sleeps.append, on_reconnect=boom)
    assert sup.ensure_connected()
