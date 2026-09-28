"""Carregamento e validação da configuração (``config.yaml`` + ``.env``).

Princípios:
* Falha segura: tipo errado, valor fora de faixa ou combinação insegura
  interrompe a inicialização com ``ConfigError``.
* Valores ``[PREENCHER]`` viram ``None``. Eles só causam erro quando a
  funcionalidade que depende deles é usada (``require``), para que módulos
  que não precisam deles (ex.: testes de dados) possam rodar.
* Segredos ficam em ``Secret``, cujo ``repr``/``str`` nunca revela o valor.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import time
from pathlib import Path
from typing import Any, Callable, TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from dotenv import dotenv_values

from app.core.enums import HARD_MAX_CONTRACTS, Mode, Timeframe, VolumeType
from app.core.errors import ConfigError, MissingConfigValue

logger = logging.getLogger(__name__)

PLACEHOLDER_PREFIX = "[PREENCHER"
DEFAULT_CONFIG_PATH = Path("config.yaml")
DEFAULT_ENV_PATH = Path(".env")

T = TypeVar("T")


class Secret:
    """Invólucro para valores sensíveis. Nunca aparece em logs ou repr."""

    __slots__ = ("_value",)

    def __init__(self, value: str | None) -> None:
        self._value = value or None

    def reveal(self) -> str | None:
        return self._value

    def is_set(self) -> bool:
        return self._value is not None

    def __repr__(self) -> str:
        return "Secret(***)" if self._value else "Secret(<vazio>)"

    __str__ = __repr__

    def __eq__(self, other: object) -> bool:  # comparação útil em testes
        return isinstance(other, Secret) and other._value == self._value

    def __hash__(self) -> int:
        return hash(self._value)


def require(value: T | None, key: str, what: str) -> T:
    """Retorna ``value`` ou falha com a informação exata que precisa ser fornecida."""
    if value is None:
        raise MissingConfigValue(key, what)
    return value


# --------------------------------------------------------------------------- seções


@dataclass(frozen=True)
class MarketConfig:
    symbol: str | None
    timeframe: Timeframe
    timezone: str
    server_utc_offset_hours: float | None
    tick_size: float | None
    tick_value: float | None
    tick_value_tolerance: float
    volume_type: VolumeType
    rollover_warning_days: int

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@dataclass(frozen=True)
class ReconnectConfig:
    initial_delay_seconds: float
    backoff_factor: float
    max_delay_seconds: float
    max_attempts: int


@dataclass(frozen=True)
class DataConfig:
    history_bars: int
    max_tick_age_seconds: float
    clock_tolerance_seconds: float
    block_on_gaps: bool
    reconnect: ReconnectConfig
    connect_timeout_ms: int


@dataclass(frozen=True)
class StrategyConfig:
    name: str
    fast_ma: int
    slow_ma: int
    volume_period: int
    volume_multiplier: float
    use_vwap_filter: bool


@dataclass(frozen=True)
class RiskConfig:
    initial_capital: float
    risk_per_trade: float
    stop_points: float
    target_points: float
    max_daily_loss: float
    max_trades_per_day: int
    max_consecutive_losses: int
    recalc_levels_from_fill: bool


@dataclass(frozen=True)
class CostsConfig:
    brokerage_per_contract: float | None
    b3_fee_per_contract: float | None
    slippage_points_entry: float
    slippage_points_exit: float
    source: str | None


@dataclass(frozen=True)
class TaxConfig:
    day_trade_rate: float
    carry_forward_losses: bool
    irrf_rate: float


@dataclass(frozen=True)
class SessionConfig:
    signal_start: time
    signal_end: time
    flatten_time: time
    avoid_opening_auction: bool


@dataclass(frozen=True)
class ExecutionConfig:
    mode: Mode
    allow_real_orders: bool
    require_confirmation: bool
    max_contracts: int
    max_price_deviation_points: float
    magic_number: int | None
    on_missing_protection: str
    kill_switch_flatten: bool
    opposite_signal_policy: str


@dataclass(frozen=True)
class BacktestConfig:
    data_file: str | None
    intrabar_conflict: str
    minimum_trades_warning: int


@dataclass(frozen=True)
class WalkForwardConfig:
    train_days: int | None
    validation_days: int | None
    test_days: int | None
    selection_metric: str
    min_trades_for_selection: int


@dataclass(frozen=True)
class DatabaseConfig:
    path: str


@dataclass(frozen=True)
class LoggingConfig:
    level: str
    file: str | None
    max_bytes: int
    backup_count: int


@dataclass(frozen=True)
class Credentials:
    mt5_login: int | None = field(repr=False)
    mt5_password: Secret
    mt5_server: str | None = field(repr=False)
    mt5_terminal_path: str | None
    telegram_bot_token: Secret
    telegram_chat_id: str | None = field(repr=False)

    def secret_values(self) -> list[str]:
        """Valores a serem mascarados nos logs."""
        values = [
            self.mt5_password.reveal(),
            self.telegram_bot_token.reveal(),
            str(self.mt5_login) if self.mt5_login is not None else None,
            self.telegram_chat_id,
        ]
        return [v for v in values if v]


@dataclass(frozen=True)
class Settings:
    market: MarketConfig
    data: DataConfig
    strategy: StrategyConfig
    risk: RiskConfig
    costs: CostsConfig
    tax: TaxConfig
    session: SessionConfig
    execution: ExecutionConfig
    backtest: BacktestConfig
    walk_forward: WalkForwardConfig
    database: DatabaseConfig
    logging: LoggingConfig
    credentials: Credentials


# --------------------------------------------------------------------------- leitura tipada


class _Section:
    """Leitor tipado de uma seção do YAML, com mensagens de erro com o caminho da chave."""

    def __init__(self, raw: Any, path: str) -> None:
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise ConfigError(f"'{path}' deve ser um mapeamento")
        self._raw = raw
        self._path = path

    def _key(self, name: str) -> str:
        return f"{self._path}.{name}"

    def _get(self, name: str, optional: bool) -> Any:
        if name not in self._raw:
            if optional:
                return None
            raise ConfigError(f"Chave obrigatória ausente: '{self._key(name)}'")
        value = self._raw[name]
        if isinstance(value, str) and value.strip().upper().startswith(PLACEHOLDER_PREFIX):
            return None
        if value is None and not optional:
            raise ConfigError(f"'{self._key(name)}' não pode ser vazio")
        return value

    def section(self, name: str) -> "_Section":
        return _Section(self._raw.get(name), self._key(name))

    def _typed(
        self, name: str, optional: bool, conv: Callable[[Any], T], type_name: str
    ) -> T | None:
        value = self._get(name, optional)
        if value is None:
            return None
        try:
            return conv(value)
        except (TypeError, ValueError) as exc:
            raise ConfigError(f"'{self._key(name)}' deve ser {type_name}, recebido {value!r}") from exc

    def str(self, name: str, optional: bool = False) -> str | None:
        return self._typed(name, optional, _to_str, "texto")

    def int(self, name: str, optional: bool = False) -> int | None:
        return self._typed(name, optional, _to_int, "inteiro")

    def float(self, name: str, optional: bool = False) -> float | None:
        return self._typed(name, optional, _to_float, "número")

    def bool(self, name: str) -> bool:
        value = self._get(name, optional=False)
        if not isinstance(value, bool):
            raise ConfigError(f"'{self._key(name)}' deve ser true/false, recebido {value!r}")
        return value

    def time(self, name: str) -> time:
        value = self.str(name)
        try:
            return parse_hhmm(value)  # type: ignore[arg-type]
        except ValueError as exc:
            raise ConfigError(f"'{self._key(name)}' deve estar no formato HH:MM, recebido {value!r}") from exc

    def choice(self, name: str, choices: set[str]) -> str:
        value = self.str(name)
        if value not in choices:
            raise ConfigError(f"'{self._key(name)}' deve ser um de {sorted(choices)}, recebido {value!r}")
        return value  # type: ignore[return-value]


def _to_str(value: Any) -> str:
    if isinstance(value, (dict, list, bool)):
        raise TypeError
    return str(value).strip()


def _to_int(value: Any) -> int:
    if isinstance(value, bool):
        raise TypeError
    if isinstance(value, float):
        if not value.is_integer():
            raise ValueError
        return int(value)
    return int(str(value).strip())


def _to_float(value: Any) -> float:
    if isinstance(value, bool):
        raise TypeError
    return float(value)


def parse_hhmm(value: str) -> time:
    parts = value.strip().split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValueError(value)
    return time(int(parts[0]), int(parts[1]))


def _positive(value: float | int | None, key: str, allow_zero: bool = False) -> None:
    if value is None:
        return
    if value < 0 or (value == 0 and not allow_zero):
        cond = ">= 0" if allow_zero else "> 0"
        raise ConfigError(f"'{key}' deve ser {cond}, recebido {value}")


def _enum(enum_cls: type, value: str | None, key: str) -> Any:
    try:
        return enum_cls(value)
    except ValueError as exc:
        valid = [e.value for e in enum_cls]
        raise ConfigError(f"'{key}' deve ser um de {valid}, recebido {value!r}") from exc


# --------------------------------------------------------------------------- construção


def _build_market(s: _Section) -> MarketConfig:
    tz_name = s.str("timezone")
    try:
        ZoneInfo(tz_name)  # type: ignore[arg-type]
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ConfigError(
            f"Timezone desconhecido: {tz_name!r}. No Windows, instale o pacote 'tzdata'."
        ) from exc
    cfg = MarketConfig(
        symbol=s.str("symbol"),
        timeframe=_enum(Timeframe, s.str("timeframe"), "market.timeframe"),
        timezone=tz_name,  # type: ignore[arg-type]
        server_utc_offset_hours=s.float("server_utc_offset_hours"),
        tick_size=s.float("tick_size"),
        tick_value=s.float("tick_value"),
        tick_value_tolerance=s.float("tick_value_tolerance"),  # type: ignore[arg-type]
        volume_type=_enum(VolumeType, s.str("volume_type"), "market.volume_type"),
        rollover_warning_days=s.int("rollover_warning_days"),  # type: ignore[arg-type]
    )
    if cfg.server_utc_offset_hours is not None and not -14 <= cfg.server_utc_offset_hours <= 14:
        raise ConfigError("'market.server_utc_offset_hours' fora da faixa [-14, 14]")
    _positive(cfg.tick_size, "market.tick_size")
    _positive(cfg.tick_value, "market.tick_value")
    _positive(cfg.tick_value_tolerance, "market.tick_value_tolerance", allow_zero=True)
    _positive(cfg.rollover_warning_days, "market.rollover_warning_days", allow_zero=True)
    return cfg


def _build_data(s: _Section) -> DataConfig:
    r = s.section("reconnect")
    reconnect = ReconnectConfig(
        initial_delay_seconds=r.float("initial_delay_seconds"),  # type: ignore[arg-type]
        backoff_factor=r.float("backoff_factor"),  # type: ignore[arg-type]
        max_delay_seconds=r.float("max_delay_seconds"),  # type: ignore[arg-type]
        max_attempts=r.int("max_attempts"),  # type: ignore[arg-type]
    )
    _positive(reconnect.initial_delay_seconds, "data.reconnect.initial_delay_seconds")
    if reconnect.backoff_factor < 1:
        raise ConfigError("'data.reconnect.backoff_factor' deve ser >= 1")
    if reconnect.max_delay_seconds < reconnect.initial_delay_seconds:
        raise ConfigError("'data.reconnect.max_delay_seconds' deve ser >= initial_delay_seconds")
    _positive(reconnect.max_attempts, "data.reconnect.max_attempts")
    cfg = DataConfig(
        history_bars=s.int("history_bars"),  # type: ignore[arg-type]
        max_tick_age_seconds=s.float("max_tick_age_seconds"),  # type: ignore[arg-type]
        clock_tolerance_seconds=s.float("clock_tolerance_seconds"),  # type: ignore[arg-type]
        block_on_gaps=s.bool("block_on_gaps"),
        reconnect=reconnect,
        connect_timeout_ms=s.int("connect_timeout_ms"),  # type: ignore[arg-type]
    )
    _positive(cfg.history_bars, "data.history_bars")
    _positive(cfg.max_tick_age_seconds, "data.max_tick_age_seconds")
    _positive(cfg.clock_tolerance_seconds, "data.clock_tolerance_seconds")
    _positive(cfg.connect_timeout_ms, "data.connect_timeout_ms")
    return cfg


def _build_strategy(s: _Section) -> StrategyConfig:
    cfg = StrategyConfig(
        name=s.str("name"),  # type: ignore[arg-type]
        fast_ma=s.int("fast_ma"),  # type: ignore[arg-type]
        slow_ma=s.int("slow_ma"),  # type: ignore[arg-type]
        volume_period=s.int("volume_period"),  # type: ignore[arg-type]
        volume_multiplier=s.float("volume_multiplier"),  # type: ignore[arg-type]
        use_vwap_filter=s.bool("use_vwap_filter"),
    )
    for key in ("fast_ma", "slow_ma", "volume_period", "volume_multiplier"):
        _positive(getattr(cfg, key), f"strategy.{key}")
    if cfg.fast_ma >= cfg.slow_ma:
        raise ConfigError("'strategy.fast_ma' deve ser menor que 'strategy.slow_ma'")
    return cfg


def _build_risk(s: _Section) -> RiskConfig:
    cfg = RiskConfig(
        initial_capital=s.float("initial_capital"),  # type: ignore[arg-type]
        risk_per_trade=s.float("risk_per_trade"),  # type: ignore[arg-type]
        stop_points=s.float("stop_points"),  # type: ignore[arg-type]
        target_points=s.float("target_points"),  # type: ignore[arg-type]
        max_daily_loss=s.float("max_daily_loss"),  # type: ignore[arg-type]
        max_trades_per_day=s.int("max_trades_per_day"),  # type: ignore[arg-type]
        max_consecutive_losses=s.int("max_consecutive_losses"),  # type: ignore[arg-type]
        recalc_levels_from_fill=s.bool("recalc_levels_from_fill"),
    )
    for key in (
        "initial_capital", "risk_per_trade", "stop_points", "target_points",
        "max_daily_loss", "max_trades_per_day", "max_consecutive_losses",
    ):
        _positive(getattr(cfg, key), f"risk.{key}")
    if cfg.risk_per_trade >= 1:
        raise ConfigError("'risk.risk_per_trade' é uma fração do capital e deve ser < 1 (ex.: 0.01 = 1%)")
    return cfg


def _build_costs(s: _Section) -> CostsConfig:
    cfg = CostsConfig(
        brokerage_per_contract=s.float("brokerage_per_contract"),
        b3_fee_per_contract=s.float("b3_fee_per_contract"),
        slippage_points_entry=s.float("slippage_points_entry"),  # type: ignore[arg-type]
        slippage_points_exit=s.float("slippage_points_exit"),  # type: ignore[arg-type]
        source=s.str("source"),
    )
    for key in ("brokerage_per_contract", "b3_fee_per_contract", "slippage_points_entry", "slippage_points_exit"):
        _positive(getattr(cfg, key), f"costs.{key}", allow_zero=True)
    return cfg


def _build_tax(s: _Section) -> TaxConfig:
    cfg = TaxConfig(
        day_trade_rate=s.float("day_trade_rate"),  # type: ignore[arg-type]
        carry_forward_losses=s.bool("carry_forward_losses"),
        irrf_rate=s.float("irrf_rate"),  # type: ignore[arg-type]
    )
    for key in ("day_trade_rate", "irrf_rate"):
        value = getattr(cfg, key)
        if not 0 <= value < 1:
            raise ConfigError(f"'tax.{key}' deve estar em [0, 1), recebido {value}")
    return cfg


def _build_session(s: _Section) -> SessionConfig:
    cfg = SessionConfig(
        signal_start=s.time("signal_start"),
        signal_end=s.time("signal_end"),
        flatten_time=s.time("flatten_time"),
        avoid_opening_auction=s.bool("avoid_opening_auction"),
    )
    if not cfg.signal_start < cfg.signal_end <= cfg.flatten_time:
        raise ConfigError("Sessão inválida: exige signal_start < signal_end <= flatten_time")
    return cfg


def _build_execution(s: _Section) -> ExecutionConfig:
    cfg = ExecutionConfig(
        mode=_enum(Mode, s.str("mode"), "execution.mode"),
        allow_real_orders=s.bool("allow_real_orders"),
        require_confirmation=s.bool("require_confirmation"),
        max_contracts=s.int("max_contracts"),  # type: ignore[arg-type]
        max_price_deviation_points=s.float("max_price_deviation_points"),  # type: ignore[arg-type]
        magic_number=s.int("magic_number"),
        on_missing_protection=s.choice("on_missing_protection", {"close", "alert"}),
        kill_switch_flatten=s.bool("kill_switch_flatten"),
        opposite_signal_policy=s.choice("opposite_signal_policy", {"ignore"}),
    )
    if not 1 <= cfg.max_contracts <= HARD_MAX_CONTRACTS:
        raise ConfigError(
            f"'execution.max_contracts'={cfg.max_contracts} não permitido: "
            f"o limite absoluto desta versão é {HARD_MAX_CONTRACTS}."
        )
    _positive(cfg.max_price_deviation_points, "execution.max_price_deviation_points")
    if cfg.magic_number is not None and cfg.magic_number <= 0:
        raise ConfigError("'execution.magic_number' deve ser um inteiro positivo")
    if cfg.mode is Mode.LIVE_EXECUTION and not cfg.allow_real_orders:
        raise ConfigError(
            "Configuração contraditória: execution.mode=LIVE_EXECUTION exige "
            "allow_real_orders=true. Nada será executado."
        )
    if cfg.allow_real_orders and cfg.mode is not Mode.LIVE_EXECUTION:
        logger.warning(
            "allow_real_orders=true ignorado: o modo %s nunca envia ordens reais", cfg.mode.value
        )
    return cfg


def _build_backtest(s: _Section) -> BacktestConfig:
    cfg = BacktestConfig(
        data_file=s.str("data_file"),
        intrabar_conflict=s.choice("intrabar_conflict", {"worst_case", "use_m1"}),
        minimum_trades_warning=s.int("minimum_trades_warning"),  # type: ignore[arg-type]
    )
    _positive(cfg.minimum_trades_warning, "backtest.minimum_trades_warning")
    return cfg


def _build_walk_forward(s: _Section) -> WalkForwardConfig:
    cfg = WalkForwardConfig(
        train_days=s.int("train_days"),
        validation_days=s.int("validation_days"),
        test_days=s.int("test_days"),
        selection_metric=s.str("selection_metric"),  # type: ignore[arg-type]
        min_trades_for_selection=s.int("min_trades_for_selection"),  # type: ignore[arg-type]
    )
    for key in ("train_days", "validation_days", "test_days", "min_trades_for_selection"):
        _positive(getattr(cfg, key), f"walk_forward.{key}")
    return cfg


def _build_logging(s: _Section) -> LoggingConfig:
    level = (s.str("level") or "").upper()
    if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ConfigError(f"'logging.level' inválido: {level!r}")
    cfg = LoggingConfig(
        level=level,
        file=s.str("file", optional=True),
        max_bytes=s.int("max_bytes"),  # type: ignore[arg-type]
        backup_count=s.int("backup_count"),  # type: ignore[arg-type]
    )
    _positive(cfg.max_bytes, "logging.max_bytes")
    _positive(cfg.backup_count, "logging.backup_count", allow_zero=True)
    return cfg


def _build_credentials(env: dict[str, str | None]) -> Credentials:
    def clean(key: str) -> str | None:
        value = env.get(key)
        return value.strip() if value and value.strip() else None

    login_raw = clean("MT5_LOGIN")
    try:
        login = int(login_raw) if login_raw else None
    except ValueError as exc:
        # Não inclui o valor na mensagem: é dado sensível.
        raise ConfigError("MT5_LOGIN deve ser numérico") from exc
    return Credentials(
        mt5_login=login,
        mt5_password=Secret(clean("MT5_PASSWORD")),
        mt5_server=clean("MT5_SERVER"),
        mt5_terminal_path=clean("MT5_TERMINAL_PATH"),
        telegram_bot_token=Secret(clean("TELEGRAM_BOT_TOKEN")),
        telegram_chat_id=clean("TELEGRAM_CHAT_ID"),
    )


_ENV_KEYS = (
    "MT5_LOGIN", "MT5_PASSWORD", "MT5_SERVER", "MT5_TERMINAL_PATH",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
)


def load_env(env_path: Path | None = DEFAULT_ENV_PATH) -> dict[str, str | None]:
    """Lê o ``.env`` (se existir) sem poluir ``os.environ``; variáveis do SO têm prioridade."""
    values: dict[str, str | None] = {}
    if env_path is not None and Path(env_path).exists():
        values.update(dotenv_values(env_path))
    for key in _ENV_KEYS:
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def settings_from_dict(raw: dict[str, Any], env: dict[str, str | None] | None = None) -> Settings:
    root = _Section(raw, "config")
    return Settings(
        market=_build_market(root.section("market")),
        data=_build_data(root.section("data")),
        strategy=_build_strategy(root.section("strategy")),
        risk=_build_risk(root.section("risk")),
        costs=_build_costs(root.section("costs")),
        tax=_build_tax(root.section("tax")),
        session=_build_session(root.section("session")),
        execution=_build_execution(root.section("execution")),
        backtest=_build_backtest(root.section("backtest")),
        walk_forward=_build_walk_forward(root.section("walk_forward")),
        database=DatabaseConfig(path=root.section("database").str("path")),  # type: ignore[arg-type]
        logging=_build_logging(root.section("logging")),
        credentials=_build_credentials(env or {}),
    )


def load_settings(
    config_path: Path | str = DEFAULT_CONFIG_PATH,
    env_path: Path | str | None = DEFAULT_ENV_PATH,
) -> Settings:
    path = Path(config_path)
    if not path.exists():
        raise ConfigError(f"Arquivo de configuração não encontrado: {path}")
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(f"YAML inválido em {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ConfigError(f"{path} deve conter um mapeamento no nível raiz")
    return settings_from_dict(raw, load_env(Path(env_path) if env_path else None))
