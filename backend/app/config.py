"""Explicit configuration loading for the backend.

Resolves `backend/.env` by file location, independent of the process's
current working directory, and does not assume the file exists.

Precedence (highest wins), for every setting below: **process environment
> backend/.env > built-in default**. This lets a deployment override a
checked-in `.env` (or run with none at all) purely via process environment
variables, without editing any file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"

# Every setting this module resolves -- also the exact set of process
# environment variables allowed to override `.env`/defaults, so an unrelated
# variable in the process environment (e.g. PATH, PYTHONPATH) can never leak
# into Settings by accident.
_RECOGNIZED_ENV_KEYS = (
    "CORS_ORIGINS",
    "DEMO_TRANSACTIONS_PATH",
    "AML_TRANSFERS_PATH",
    "AML_LABELS_PATH",
    "LOG_LEVEL",
    "CASE_DB_PATH",
)


def _load_env_values() -> dict[str, str]:
    """Merges backend/.env with the process environment, process environment
    winning on any key both define -- see module docstring for precedence."""
    file_values: dict[str, str] = {}
    if ENV_PATH.exists():
        file_values = {k: v for k, v in dotenv_values(ENV_PATH).items() if v is not None}

    merged = dict(file_values)
    for key in _RECOGNIZED_ENV_KEYS:
        if key in os.environ:
            merged[key] = os.environ[key]
    return merged


def _parse_cors_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


# The browser treats "localhost" and "127.0.0.1" as distinct origins even
# though both resolve to loopback -- both are accepted by default so the
# frontend works whichever one it's actually opened through (Next's own dev
# server prints "localhost"; this repo's Docker port publishing uses
# "127.0.0.1"). See backend/docs/integration-contract.md for why this was
# widened from the original single-origin default.
DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


@dataclass(frozen=True)
class Settings:
    cors_origins: list[str] = field(default_factory=lambda: list(DEFAULT_CORS_ORIGINS))
    demo_transactions_path: Path = REPO_ROOT / "data" / "demo_transactions.json"
    aml_transfers_path: Path = REPO_ROOT / "data" / "aml" / "transfers_inr.csv"
    aml_labels_path: Path = REPO_ROOT / "data" / "aml" / "transfer_labels_and_splits.csv"
    log_level: str = "INFO"
    case_db_path: Path = BACKEND_DIR / ".runtime" / "cases.sqlite3"


def _resolve_path(raw: str | None, default: Path) -> Path:
    if not raw:
        return default
    path = Path(raw)
    return path if path.is_absolute() else REPO_ROOT / path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    values = _load_env_values()

    cors_raw = values.get("CORS_ORIGINS")
    cors_origins = _parse_cors_origins(cors_raw) if cors_raw else list(DEFAULT_CORS_ORIGINS)

    tx_path = _resolve_path(values.get("DEMO_TRANSACTIONS_PATH"), REPO_ROOT / "data" / "demo_transactions.json")
    aml_path = _resolve_path(values.get("AML_TRANSFERS_PATH"), REPO_ROOT / "data" / "aml" / "transfers_inr.csv")
    aml_labels_path = _resolve_path(
        values.get("AML_LABELS_PATH"), REPO_ROOT / "data" / "aml" / "transfer_labels_and_splits.csv"
    )

    log_level = values.get("LOG_LEVEL", "INFO")

    return Settings(
        cors_origins=cors_origins,
        demo_transactions_path=tx_path,
        aml_transfers_path=aml_path,
        aml_labels_path=aml_labels_path,
        log_level=log_level,
        case_db_path=_resolve_path(values.get("CASE_DB_PATH"), BACKEND_DIR / ".runtime" / "cases.sqlite3"),
    )
