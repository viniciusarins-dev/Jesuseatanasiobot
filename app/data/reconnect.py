"""Supervisão de conexão com backoff progressivo.

Estados (``ConnectionState``):
* CONNECTED     — operação normal.
* DEGRADED      — falha detectada / reconectando. NENHUMA nova operação.
* DISCONNECTED  — tentativas do ciclo esgotadas. NENHUMA nova operação;
                  o próximo ``ensure_connected`` inicia um novo ciclo.

Após cada reconexão bem-sucedida, ``needs_reconciliation`` fica True até que
quem consome (fases de execução) confirme a reconciliação do estado.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Protocol, TypeVar

from app.core.enums import ConnectionState
from app.core.errors import MT5ConnectionError, MT5UnavailableError
from app.utils.logger import ctx

logger = logging.getLogger(__name__)
T = TypeVar("T")


class Connectable(Protocol):
    def connect(self) -> object: ...
    def reconnect(self) -> object: ...
    def is_connected(self) -> bool: ...


@dataclass(frozen=True)
class BackoffPolicy:
    initial_delay: float
    factor: float
    max_delay: float
    max_attempts: int

    def delay(self, attempt: int) -> float:
        """Espera antes da tentativa ``attempt`` (1-based)."""
        return min(self.initial_delay * self.factor ** (attempt - 1), self.max_delay)


class ConnectionSupervisor:
    def __init__(
        self,
        client: Connectable,
        policy: BackoffPolicy,
        sleep: Callable[[float], None] = time.sleep,
        on_reconnect: Callable[[], None] | None = None,
    ) -> None:
        self._client = client
        self._policy = policy
        self._sleep = sleep
        self._on_reconnect = on_reconnect
        self._state = ConnectionState.DISCONNECTED
        self._needs_reconciliation = True  # startup também exige reconciliação
        self._ever_connected = False

    @property
    def state(self) -> ConnectionState:
        return self._state

    @property
    def can_open_new_positions(self) -> bool:
        """Critério de conexão para novas operações (outros critérios ficam no guard)."""
        return self._state is ConnectionState.CONNECTED and not self._needs_reconciliation

    @property
    def needs_reconciliation(self) -> bool:
        return self._needs_reconciliation

    def mark_reconciled(self) -> None:
        self._needs_reconciliation = False
        logger.info("Estado reconciliado após (re)conexão")

    def ensure_connected(self) -> bool:
        if self._state is ConnectionState.CONNECTED and self._client.is_connected():
            return True
        if self._state is ConnectionState.CONNECTED:
            logger.error("MT5 desconectado")
        self._state = ConnectionState.DEGRADED

        for attempt in range(1, self._policy.max_attempts + 1):
            if attempt > 1 or self._ever_connected:
                wait = self._policy.delay(attempt)
                logger.info(
                    "Aguardando para reconectar",
                    extra=ctx(tentativa=attempt, de=self._policy.max_attempts, espera_s=wait),
                )
                self._sleep(wait)
            try:
                if self._ever_connected:
                    self._client.reconnect()
                else:
                    self._client.connect()
            except MT5UnavailableError:
                self._state = ConnectionState.DISCONNECTED
                raise  # biblioteca ausente não é falha temporária
            except MT5ConnectionError as exc:
                logger.error("Falha de conexão com o MT5", extra=ctx(tentativa=attempt, erro=str(exc)))
                continue
            if self._client.is_connected():
                return self._on_connected()
            logger.error("Conexão não confirmada após tentativa", extra=ctx(tentativa=attempt))

        self._state = ConnectionState.DISCONNECTED
        logger.error("Tentativas de reconexão esgotadas — sistema sem conexão", extra=ctx(tentativas=self._policy.max_attempts))
        return False

    def _on_connected(self) -> bool:
        was_reconnect = self._ever_connected
        self._ever_connected = True
        self._state = ConnectionState.CONNECTED
        self._needs_reconciliation = True
        logger.info("MT5 reconectado" if was_reconnect else "MT5 conectado (supervisor)")
        if self._on_reconnect is not None:
            try:
                self._on_reconnect()
            except Exception:  # noqa: BLE001 - callback não pode derrubar o supervisor
                logger.exception("Erro no callback de reconexão")
        return True

    def call(self, func: Callable[[], T]) -> T:
        """Executa ``func``; em falha de conexão marca DEGRADED, reconecta e tenta UMA vez mais."""
        try:
            return func()
        except MT5ConnectionError as exc:
            logger.error("Falha de conexão durante chamada", extra=ctx(erro=str(exc)))
            self._state = ConnectionState.DEGRADED
            if not self.ensure_connected():
                raise
            return func()
