"""Explicit configuration loading for the backend.

Resolves `backend/.env` by file location, independent of the process's
current working directory, and does not assume the file exists.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"


def _load_env_values() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    return {k: v for k, v in dotenv_values(ENV_PATH).items() if v is not None}


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
    log_level: str = "INFO"


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

    log_level = values.get("LOG_LEVEL", "INFO")

    return Settings(
        cors_origins=cors_origins,
        demo_transactions_path=tx_path,
        aml_transfers_path=aml_path,
        log_level=log_level,
    )
