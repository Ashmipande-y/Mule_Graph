"""Operational measurements and structured metrics endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.services.metrics import get_metrics_collector

router = APIRouter(prefix="/api/operations")


@router.get("/metrics")
def get_metrics() -> dict[str, Any]:
    """Return structured operational measurements including request latency percentiles,
    analysis duration percentiles, ingestion failures, job backlog, and event lag.
    """
    return get_metrics_collector().get_operational_metrics()
