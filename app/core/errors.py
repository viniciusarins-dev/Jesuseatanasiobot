"""Hierarquia de exceções do sistema."""

from __future__ import annotations


class TradingSystemError(Exception):
    """Base de todos os erros do sistema."""


class ConfigError(TradingSystemError):
    """Configuração ausente, inválida ou insegura."""


class MissingConfigValue(ConfigError):
    """Valor marcado como [PREENCHER] é necessário para a operação solicitada."""

    def __init__(self, key: str, what: str) -> None:
        super().__init__(f"CONFIGURÁVEL: '{key}' não preenchido. Necessário: {what}")
        self.key = key


class MT5Error(TradingSystemError):
    """Falha na comunicação com o MetaTrader 5."""

    def __init__(self, message: str, code: int | None = None) -> None:
        super().__init__(message if code is None else f"{message} (código MT5 {code})")
        self.code = code


class MT5ConnectionError(MT5Error):
    """Terminal indisponível, não conectado ou conta divergente."""


class MT5UnavailableError(MT5ConnectionError):
    """A biblioteca MetaTrader5 não está instalada (ex.: ambiente não-Windows)."""


class MT5DataError(MT5Error):
    """Chamada de dados retornou vazio/None."""


class DataValidationError(TradingSystemError):
    """Dados de mercado inválidos."""


class SymbolValidationError(TradingSystemError):
    """Símbolo inexistente, não negociável ou divergente da configuração."""


class UnsafeStateError(TradingSystemError):
    """Estado incerto: o sistema não deve operar."""
