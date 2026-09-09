"""Health and dependency readiness check endpoints."""

from __future__ import annotations

import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.config import get_settings
from app.schemas import HealthResponse
from app.services.event_bus import get_event_bus

router = APIRouter()


class ReadinessResponse(BaseModel):
    status: str
    timestamp: str
    checks: dict[str, str]
    details: dict[str, Any]


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Liveness probe: returns 200 immediately if process is alive."""
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=ReadinessResponse)
def get_readiness(response: Response) -> ReadinessResponse:
    """Readiness probe: validates all enabled dependencies (data files, rules, models, event bus).

    Returns 200 if all checks pass; returns 503 Service Unavailable if any critical dependency fails.
    """
    settings = get_settings()
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    checks: dict[str, str] = {}
    details: dict[str, Any] = {}
    all_ready = True

    # 1. Demo transactions file
    demo_path = settings.demo_transactions_path
    if demo_path.exists() and demo_path.is_file():
        checks["demo_transactions"] = "ok"
        details["demo_transactions_path"] = str(demo_path)
    else:
        checks["demo_transactions"] = "failed: missing or inaccessible"
        all_ready = False

    # 2. AML dataset file -- optional (AML_MODE=optional is a fully
    # supported deployment; see docker-entrypoint.sh and backend/README.md:
    # "/api/graph and POST /api/assess work fully regardless"). Its absence
    # must not fail readiness, only be surfaced as a warning, same as the
    # optional model files below.
    aml_path = settings.aml_transfers_path
    if aml_path.exists() and aml_path.is_file():
        checks["aml_dataset"] = "ok"
        details["aml_transfers_path"] = str(aml_path)
    else:
        checks["aml_dataset"] = "warning: optional AML dataset not present"

    # 3. Rules Engine readiness
    try:
        from app.adapters.ml_rules import assess_accounts

        # Quick smoke check on an empty list
        assess_accounts([])
        checks["rules_engine"] = "ok"
    except Exception as exc:
        checks["rules_engine"] = f"failed: {exc}"
        all_ready = False

    # 4. XGBoost Model files
    models_dir = Path(__file__).resolve().parents[3] / "ml" / "models"
    xgb_model_path = models_dir / "xgb_baseline.joblib"
    aml_model_path = models_dir / "aml_baseline.joblib"

    if xgb_model_path.exists():
        checks["xgb_baseline_model"] = "ok"
    else:
        checks["xgb_baseline_model"] = "warning: xgb_baseline.joblib not found"

    if aml_model_path.exists():
        checks["aml_baseline_model"] = "ok"
    else:
        checks["aml_baseline_model"] = "warning: aml_baseline.joblib not found"

    # 5. Event bus readiness
    try:
        bus_stats = get_event_bus().get_stats()
        checks["event_bus"] = "ok"
        details["event_bus_buffered_count"] = bus_stats["buffered_events_count"]
    except Exception as exc:
        checks["event_bus"] = f"failed: {exc}"
        all_ready = False

    if not all_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(
        status="ready" if all_ready else "degraded",
        timestamp=now_iso,
        checks=checks,
        details=details,
    )
