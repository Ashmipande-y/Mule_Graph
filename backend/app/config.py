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


@dataclass(frozen=True)
class Settings:
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:3000"])
    demo_transactions_path: Path = REPO_ROOT / "data" / "demo_transactions.json"
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    values = _load_env_values()

    cors_raw = values.get("CORS_ORIGINS")
    cors_origins = _parse_cors_origins(cors_raw) if cors_raw else ["http://localhost:3000"]

    tx_path_raw = values.get("DEMO_TRANSACTIONS_PATH")
    if tx_path_raw:
        tx_path = Path(tx_path_raw)
        if not tx_path.is_absolute():
            tx_path = REPO_ROOT / tx_path
    else:
        tx_path = REPO_ROOT / "data" / "demo_transactions.json"

    log_level = values.get("LOG_LEVEL", "INFO")

    return Settings(
        cors_origins=cors_origins,
        demo_transactions_path=tx_path,
        log_level=log_level,
    )
