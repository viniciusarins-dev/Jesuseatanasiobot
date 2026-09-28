"""Smoke test da integração REAL com o MetaTrader 5 (rodar no Windows).

SOMENTE LEITURA: nenhuma ordem é enviada (o cliente não possui essa função).

Uso (na raiz do projeto, com o terminal MT5 aberto e logado)::

    python -m scripts.mt5_smoke_test
    python -m scripts.mt5_smoke_test --export-days 30   # também exporta histórico M5

Verifica: conexão, conta (modo de margem), terminal, símbolo (10 checagens),
último tick e defasagem de relógio (detecta offset de fuso errado), candles
M1/M5 com separação fechado × em formação, validação, gaps, posições e ordens
abertas (apenas contagem) e, opcionalmente, exporta CSV canônico.
"""

from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

from app.config.settings import load_settings
from app.core.enums import Timeframe
from app.core.errors import TradingSystemError
from app.data.candle_manager import CandleManager, InMemoryStateStore
from app.data.historical import export_from_mt5
from app.data.mt5_client import MT5Client
from app.data.symbol_info import validate_symbol
from app.data.tick_manager import TickManager
from app.utils.logger import setup_logging
from app.utils.time_utils import now_utc, to_local


def _line(title: str) -> None:
    print(f"\n=== {title} ".ljust(70, "="))


def run(config: str, env: str, export_days: int | None) -> int:
    settings = load_settings(config, env)
    setup_logging("INFO", None, secrets=settings.credentials.secret_values())
    market, creds = settings.market, settings.credentials
    ok = True

    client = MT5Client(
        server_utc_offset_hours=market.server_utc_offset_hours,
        login=creds.mt5_login,
        password=creds.mt5_password,
        server=creds.mt5_server,
        terminal_path=creds.mt5_terminal_path,
        timeout_ms=settings.data.connect_timeout_ms,
    )
    try:
        _line("CONEXÃO")
        account = client.connect()
        terminal = client.terminal()
        print(f"terminal build={terminal.build} conectado={terminal.connected} algo_trading={terminal.trade_allowed}")
        print(f"conta: moeda={account.currency} margin_mode={account.margin_mode.value} "
              f"trade_allowed={account.trade_allowed} trade_expert={account.trade_expert}")

        _line("SÍMBOLO")
        report = validate_symbol(client, market, require_trading=False)
        if report.spec:
            s = report.spec
            print(f"{s.name} — {s.description}")
            print(f"trade_mode={s.trade_mode.value} volume min/max/step={s.volume_min}/{s.volume_max}/{s.volume_step}")
            print(f"tick_size={s.tick_size} tick_value={s.tick_value} {s.currency_profit} digits={s.digits}")
            print(f"filling_mode={s.filling_mode} stops_level={s.stops_level} vencimento={s.expiration_time}")
        print(f"resultado: {'OK' if report.ok else 'REPROVADO'} — {report.summary()}")
        ok &= report.ok
        if market.symbol is None or report.spec is None:
            return 1

        _line("TICK / RELÓGIO")
        ticks = TickManager(client, market.symbol, settings.data.max_tick_age_seconds, settings.data.clock_tolerance_seconds)
        status = ticks.status()
        if status.tick:
            t = status.tick
            print(f"último tick (local {market.timezone}): {to_local(t.time, market.tz)} bid={t.bid} ask={t.ask} last={t.last}")
            print(f"idade do tick: {status.age_seconds:.1f}s  fresco={status.fresh}")
            if status.suggested_offset_correction_hours:
                print(f"!!! Defasagem ~{status.suggested_offset_correction_hours}h: "
                      f"market.server_utc_offset_hours provavelmente está errado.")
        for issue in status.issues:
            print(f"  {issue}")
        print("(fora do pregão o tick fica 'velho' — isso é esperado)")

        for tf in (Timeframe.M1, Timeframe.M5):
            _line(f"CANDLES {tf.value}")
            manager = CandleManager(
                client, ticks, market.symbol, tf, market.tz, market.volume_type,
                settings.data.history_bars, settings.data.block_on_gaps, InMemoryStateStore(),
            )
            raw = client.copy_rates(market.symbol, tf, 3)
            print("últimos 3 candles brutos (o último pode estar em formação):")
            for _, row in raw.iterrows():
                print(f"  {to_local(row['time'].to_pydatetime(), market.tz)} O={row['open']} H={row['high']} "
                      f"L={row['low']} C={row['close']} tickvol={row['tick_volume']} realvol={row['real_volume']}")
            snap = manager.snapshot()
            print(f"snapshot utilizável={snap.usable} candles fechados={len(snap.candles)} "
                  f"último fechado={snap.last_closed_time}")
            for issue in snap.issues:
                print(f"  {issue}")

        _line("POSIÇÕES / ORDENS (somente leitura)")
        print(f"posições abertas no símbolo: {len(client.positions(market.symbol))}")
        print(f"ordens pendentes no símbolo: {len(client.orders(market.symbol))}")

        if export_days:
            _line("EXPORTAÇÃO")
            end = now_utc()
            path = Path("data/historical") / f"{market.symbol}_{market.timeframe.value}.csv"
            rows = export_from_mt5(client, market.symbol, market.timeframe, end - timedelta(days=export_days), end,
                                   path, market.server_utc_offset_hours)
            print(f"{rows} candles exportados para {path}")
    except TradingSystemError as exc:
        print(f"\nFALHA: {exc}")
        return 1
    finally:
        client.shutdown()
    print("\nSmoke test concluído:", "OK" if ok else "COM PENDÊNCIAS")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test MT5 (somente leitura)")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--env", default=".env")
    parser.add_argument("--export-days", type=int, default=None)
    args = parser.parse_args()
    return run(args.config, args.env, args.export_days)


if __name__ == "__main__":
    sys.exit(main())
