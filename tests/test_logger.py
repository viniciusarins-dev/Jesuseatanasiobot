from __future__ import annotations

import logging

from app.utils.logger import MASK, SecretMaskingFilter, StructuredFormatter, ctx, mask, register_secret, setup_logging

TOKEN = "123456789:ABCdefGhIJKlmnoPQRstuVWXyz0123456789"


def _format(record_msg: str, *args, extra=None, exc_info=None) -> str:
    logger = logging.getLogger("test.masking")
    record = logger.makeRecord("test.masking", logging.INFO, __file__, 1, record_msg, args, exc_info, extra=extra)
    SecretMaskingFilter().filter(record)
    return StructuredFormatter().format(record)


def test_registered_secret_is_masked_in_message_and_args():
    register_secret("minha-senha-123")
    out = _format("login falhou com %s", "minha-senha-123")
    assert "minha-senha-123" not in out
    assert MASK in out


def test_telegram_token_pattern_masked_even_if_not_registered():
    assert TOKEN not in mask(f"url=https://api.telegram.org/bot{TOKEN}/sendMessage")


def test_context_values_masked_and_rendered():
    register_secret("998877")
    out = _format("conectado", extra=ctx(conta="998877", build=4000))
    assert "998877" not in out
    assert "build=4000" in out


def test_exception_text_masked():
    register_secret("pw-secreta")
    try:
        raise RuntimeError("falha com pw-secreta")
    except RuntimeError:
        import sys

        out = _format("erro", exc_info=sys.exc_info())
    assert "pw-secreta" not in out
    assert "RuntimeError" in out


def test_short_secrets_not_registered_to_avoid_destroying_logs():
    register_secret("1")
    assert mask("valor 1 e 10") == "valor 1 e 10"


def test_file_handler_output_is_masked(tmp_path):
    log_file = tmp_path / "logs" / "app.log"
    setup_logging("INFO", log_file, secrets=["senha-do-arquivo"])
    logging.getLogger("test.file").info("senha=%s", "senha-do-arquivo")
    for handler in logging.getLogger().handlers:
        handler.flush()
    content = log_file.read_text(encoding="utf-8")
    assert "senha-do-arquivo" not in content
    assert MASK in content
    setup_logging("INFO", None)  # remove handler de arquivo
