from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import pytest
import yaml

from app.config.settings import Settings, settings_from_dict
from app.utils.logger import clear_secrets
from tests.fakes.fake_mt5 import FakeMT5

ROOT = Path(__file__).resolve().parents[1]
SP = ZoneInfo("America/Sao_Paulo")
UTC = timezone.utc
OFFSET = -3.0  # servidor fake no horário de Brasília
SYMBOL = "WINTEST"


@pytest.fixture(autouse=True)
def _reset_secrets():
    clear_secrets()
    yield
    clear_secrets()


@pytest.fixture
def raw_config() -> dict[str, Any]:
    """config.yaml do repositório com os [PREENCHER] resolvidos para os testes."""
    raw = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    raw = copy.deepcopy(raw)
    raw["market"].update(symbol=SYMBOL, server_utc_offset_hours=OFFSET, tick_size=5, tick_value=1.0)
    raw["execution"]["magic_number"] = 777
    raw["logging"]["file"] = None
    return raw


@pytest.fixture
def settings(raw_config) -> Settings:
    return settings_from_dict(raw_config)


def local_dt(y: int, m: int, d: int, hh: int, mm: int, ss: int = 0) -> datetime:
    """Horário de Brasília → datetime UTC."""
    return datetime(y, m, d, hh, mm, ss, tzinfo=SP).astimezone(UTC)


def server_epoch(dt_utc: datetime, offset: float = OFFSET) -> int:
    """UTC real → epoch no relógio do servidor (como o MT5 entrega)."""
    return int((dt_utc + timedelta(hours=offset)).timestamp())


def make_rows(start_utc: datetime, n: int, step_s: int = 300, base: float = 120_000.0) -> list[tuple]:
    """Candles válidos no formato do MT5 (epoch do servidor)."""
    rows = []
    for i in range(n):
        t = start_utc + timedelta(seconds=step_s * i)
        o = base + i * 5
        rows.append((server_epoch(t), o, o + 20, o - 10, o + 5, 100 + i, 1, 50 + i))
    return rows


def make_df(start_utc: datetime, n: int, step_s: int = 300, base: float = 120_000.0) -> pd.DataFrame:
    """Candles válidos já normalizados (time em UTC)."""
    rows = []
    for i in range(n):
        t = start_utc + timedelta(seconds=step_s * i)
        o = base + i * 5
        rows.append(
            {"time": t, "open": o, "high": o + 20, "low": o - 10, "close": o + 5,
             "tick_volume": 100 + i, "real_volume": 50 + i, "spread": 1}
        )
    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["time"], utc=True).astype("datetime64[ns, UTC]")
    return df


@pytest.fixture
def fake_mt5() -> FakeMT5:
    return FakeMT5()
