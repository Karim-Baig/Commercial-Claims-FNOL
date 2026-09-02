"""
Thin database layer.

SQLite by default so the POC runs with no infrastructure. The production target is
MySQL with InnoDB Cluster and Group Replication (NFR-17); the swap point is this module
alone, because every query uses named parameters that both drivers accept.
"""
import sqlite3
from pathlib import Path
from typing import Any, Iterable

from . import settings

_conn: sqlite3.Connection | None = None


def connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        Path(settings.SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(settings.SQLITE_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON")
    return _conn


def reset_for_tests(path: str = ":memory:") -> sqlite3.Connection:
    """Used by the test suite to obtain a clean in-memory database."""
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
    _conn = sqlite3.connect(path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA foreign_keys = ON")
    return _conn


def query(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    cur = connect().execute(sql, params or {})
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    return rows


def query_one(sql: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: dict[str, Any] | None = None) -> None:
    c = connect()
    c.execute(sql, params or {})
    c.commit()


def execute_many(sql: str, seq: Iterable[dict[str, Any]]) -> None:
    c = connect()
    c.executemany(sql, list(seq))
    c.commit()


def get_conn() -> sqlite3.Connection:
    """Returns the active connection for direct use (e.g. multi-statement transactions)."""
    return connect()


def expand_in(name: str, values: list[str]) -> tuple[str, dict[str, Any]]:
    """
    Builds a parameterised IN clause.

    Values are never interpolated into SQL text, so an org-scope list cannot be used
    for injection.
    """
    if not values:
        return "(NULL)", {}
    keys = [f"{name}{i}" for i in range(len(values))]
    clause = "(" + ", ".join(f":{k}" for k in keys) + ")"
    return clause, dict(zip(keys, values))
