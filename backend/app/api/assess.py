"""POST /api/assess -- stateless network-context risk assessment for a
caller-supplied transaction set, in the canonical UPI demo's own schema
(whole-rupee `amount`, not the separate AML dataset's `amount_paise`).

Implements `frontend/docs/assessment-endpoint-contract.md`. Reuses the same
validation (`app.services.graph.validate_transactions`) and rules adapter
(`app.adapters.ml_rules`) that `GET /api/graph` already uses -- this
evaluates the given transactions the same way `/api/graph` evaluates the
canonical fixture, just against caller-supplied data instead of
`data/demo_transactions.json`, and it never writes to that file or any
other stored state: there is no commit/session concept here (unlike the
separate AML dataset's `POST /api/aml/session/transactions`), and repeated
calls with the same input always produce the same result.

Never wired to `ml/xgb_baseline` (a different domain, no account/graph
structure) or the AML dataset's `ml/aml_baseline` classifier -- this is
`ml/rules` only, exactly as `/api/graph` already is.
"""

from __future__ import annotations

import datetime
import logging
import time

from fastapi import APIRouter, HTTPException

from app.adapters import ml_rules
from app.adapters.ml_rules import MlRulesError
from app.services.assessment import build_assessment_result
from app.services.event_bus import get_event_bus
from app.services.metrics import get_metrics_collector
from app.schemas import AssessRequest, AssessResponse, GraphFinding
from app.services.graph import GraphSourceError, validate_transactions

logger = logging.getLogger("app.api.assess")

router = APIRouter()


@router.post("/api/assess", response_model=AssessResponse)
def assess(request: AssessRequest) -> AssessResponse:
    # Duplicate transaction ids within one request are a malformed request,
    # not a conflict with any stored state (this endpoint has none) --
    # checked before validation so the error is specific and doesn't depend
    # on which duplicate validate_transactions happens to notice first.
    ids_seen: set[str] = set()
    for tx in request.transactions:
        if tx.id in ids_seen:
            raise HTTPException(status_code=409, detail=f"duplicate transaction id within this request: {tx.id}")
        ids_seen.add(tx.id)

    raw_records = [tx.model_dump() for tx in request.transactions]
    try:
        validated = validate_transactions(raw_records)
    except GraphSourceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    t0 = time.time()
    try:
        _, findings, account_risk = ml_rules.evaluate_transactions(validated)
    except MlRulesError as exc:
        raise HTTPException(
            status_code=422, detail=f"rules adapter rejected an already-validated record: {exc}"
        ) from exc

    duration_ms = (time.time() - t0) * 1000
    get_metrics_collector().record_analysis_duration("upi_assess", duration_ms)

    get_event_bus().publish(
        event_type="assessment_completed",
        data={
            "assessment_type": "upi_rules",
            "transaction_count": len(validated),
            "patterns_detected": len(findings),
            "high_risk_accounts": sum(1 for a in account_risk.values() if a.risk_level == "HIGH"),
            "duration_ms": round(duration_ms, 2),
        },
    )

    accounts, patterns, accounts_requiring_review = build_assessment_result(validated, findings, account_risk)

    return AssessResponse(
        status="completed",
        assessed_at=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        model_mode="rules",
        accounts=accounts,
        accounts_requiring_review=accounts_requiring_review,
        patterns=patterns,
        findings=[GraphFinding.model_validate(f.to_dict()) for f in findings],
    )
