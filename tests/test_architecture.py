"""Regras de arquitetura verificadas estaticamente (AST), sem importar os módulos."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"

# Módulos que devem permanecer independentes de infraestrutura.
PURE_PACKAGES = ("core", "strategies", "risk", "indicators")
FORBIDDEN_FOR_PURE = (
    "MetaTrader5", "telegram", "sqlite3",
    "app.data", "app.execution", "app.database", "app.notifier", "app.live",
)


def _python_files(package: str) -> list[Path]:
    return sorted((APP / package).rglob("*.py"))


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def _string_constants(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)}


@pytest.mark.parametrize("package", PURE_PACKAGES)
def test_pure_packages_do_not_import_infrastructure(package):
    violations = []
    for path in _python_files(package):
        for module in _imported_modules(path):
            if any(module == f or module.startswith(f + ".") for f in FORBIDDEN_FOR_PURE):
                violations.append(f"{path.relative_to(APP)} importa {module}")
    assert not violations, violations


def test_only_mt5_client_knows_metatrader5():
    allowed = APP / "data" / "mt5_client.py"
    offenders = []
    for path in APP.rglob("*.py"):
        if path == allowed:
            continue
        if "MetaTrader5" in _imported_modules(path) or "MetaTrader5" in _string_constants(path):
            offenders.append(str(path.relative_to(APP)))
    assert not offenders, offenders


def test_mt5_client_imports_library_lazily():
    """Nenhum ``import MetaTrader5`` no nível de módulo."""
    tree = ast.parse((APP / "data" / "mt5_client.py").read_text(encoding="utf-8"))
    top_level = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]
    names = {a.name for n in top_level if isinstance(n, ast.Import) for a in n.names}
    names |= {n.module for n in top_level if isinstance(n, ast.ImportFrom)}
    assert "MetaTrader5" not in names


def test_phase1_has_no_order_sending_anywhere():
    offenders = [
        str(p.relative_to(APP)) for p in APP.rglob("*.py") if "order_send" in p.read_text(encoding="utf-8")
    ]
    assert not offenders, offenders
