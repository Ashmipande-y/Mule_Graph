"""IBM synthetic AML benchmark endpoints.

A separate, explicitly-labeled dataset from the canonical UPI demo -- see
backend/docs/aml-integration-contract.md. Reuses ml/rules (at a dataset-
appropriate timescale, backend/app/adapters/aml_rules.py) for network
findings, and a newly-trained ml/aml_baseline XGBoost model (backend/app/
adapters/aml_baseline.py) for per-transaction classification. Neither the
canonical demo's GET /api/graph nor POST /api/xgb-score is modified by any
route here.
"""

from __future__ import annotations

import datetime
import logging

from fastapi import APIRouter, HTTPException, Query

from app.adapters import aml_baseline, aml_rules
from app.adapters.aml_baseline import AmlModelUnavailableError
from app.schemas import (
    AmlAssessRequest,
    AmlAssessResponse,
    AmlAssessResultItem,
    AmlDatasetSummaryResponse,
    AmlGraphNode,
    AmlGraphResponse,
    AmlRulesFinding,
    AmlSessionCommitRequest,
    AmlSessionCommitResponse,
    AmlTransactionIn,
    AmlTransactionListResponse,
    AmlTransactionOut,
)
from app.services import aml_dataset, aml_session
from app.services.aml_dataset import AmlDatasetError, AmlValidationError
from app.services.aml_types import AmlRecord

logger = logging.getLogger("app.api.aml")

router = APIRouter(prefix="/api/aml")


def _record_to_out(record: AmlRecord) -> AmlTransactionOut:
    return AmlTransactionOut(
        id=record.id,
        sender=record.sender,
        receiver=record.receiver,
        amount_paise=record.amount_paise,
        currency=record.currency,
        timestamp=record.timestamp,
        payment_format=record.payment_format,
    )


def _in_to_record(item: AmlTransactionIn) -> AmlRecord:
    # Pydantic already validated shape/type/pattern; re-validate through the
    # same service-layer function used for the base dataset so both paths
    # enforce identical business rules (sender != receiver, supported
    # currency/payment format), not two copies of the same policy.
    try:
        return aml_dataset.validate_record(
            item.id, item.sender, item.receiver, item.amount_paise, item.currency, item.timestamp, item.payment_format
        )
    except AmlValidationError as exc:
        raise HTTPException(status_code=422, detail=f"{exc.field}: {exc}") from exc


@router.get("/summary", response_model=AmlDatasetSummaryResponse)
def get_summary() -> AmlDatasetSummaryResponse:
    try:
        summary = aml_dataset.get_summary()
    except AmlDatasetError as exc:
        logger.error("AML dataset unavailable: %s", exc)
        raise HTTPException(status_code=500, detail=f"AML dataset is unavailable: {exc}") from exc

    model_available = True
    model_version = None
    try:
        model_available = True
        model_version = aml_baseline.model_metadata()["model_version"]
    except AmlModelUnavailableError:
        model_available = False

    return AmlDatasetSummaryResponse(
        source=summary.source,
        amount_unit=summary.amount_unit,
        timestamp_timezone_note=summary.timestamp_timezone_note,
        total_transactions=summary.total_transactions,
        total_accounts=summary.total_accounts,
        period_start=summary.period_start,
        period_end=summary.period_end,
        session_transaction_count=summary.session_transaction_count,
        scoring_method=summary.scoring_method,
        model_available=model_available,
        model_version=model_version,
    )


@router.get("/transactions", response_model=AmlTransactionListResponse)
def list_transactions(
    after: str | None = Query(default=None, description="Minute-precision UTC ISO 8601 lower bound (inclusive)."),
    before: str | None = Query(default=None, description="Minute-precision UTC ISO 8601 upper bound (inclusive)."),
    account: str | None = Query(default=None, description="Filter to transactions where this account is sender or receiver."),
    cursor: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
) -> AmlTransactionListResponse:
    try:
        page = aml_dataset.list_transactions(after=after, before=before, account=account, cursor=cursor, limit=limit)
    except AmlDatasetError as exc:
        logger.error("AML dataset unavailable: %s", exc)
        raise HTTPException(status_code=500, detail=f"AML dataset is unavailable: {exc}") from exc

    return AmlTransactionListResponse(
        items=[_record_to_out(r) for r in page.items],
        next_cursor=page.next_cursor,
        total_matching=page.total_matching,
    )


@router.get("/graph", response_model=AmlGraphResponse)
def get_graph(
    account: str | None = Query(default=None, description="Seed account; defaults to the largest-degree hub."),
    max_nodes: int = Query(default=40, ge=1, le=200),
    max_edges: int = Query(default=120, ge=1, le=500),
) -> AmlGraphResponse:
    try:
        neighborhood = aml_dataset.get_neighborhood(account=account, max_nodes=max_nodes, max_edges=max_edges)
    except AmlDatasetError as exc:
        logger.error("AML dataset unavailable: %s", exc)
        raise HTTPException(status_code=500, detail=f"AML dataset is unavailable: {exc}") from exc

    findings, account_risk = aml_rules.assess_neighborhood(neighborhood.edges)

    nodes = [
        AmlGraphNode(
            id=account_id,
            label=account_id,
            risk_score=(account_risk[account_id].max_score if account_id in account_risk else None),
            risk_level=(account_risk[account_id].risk_level if account_id in account_risk else "UNASSESSED"),
        )
        for account_id in neighborhood.nodes
    ]

    rules_findings = [
        AmlRulesFinding(
            pattern=f.pattern,
            source_account=f.source_account,
            collector_account=f.collector_account,
            intermediary_accounts=list(f.intermediary_accounts),
            score=f.score,
            score_method=f.score_method,
            evidence=f.evidence,
        )
        for f in findings
    ]

    return AmlGraphResponse(
        nodes=nodes,
        edges=[_record_to_out(r) for r in neighborhood.edges],
        seed_account=neighborhood.seed_account,
        rules_findings=rules_findings,
    )


@router.post("/assess", response_model=AmlAssessResponse)
def assess(request: AmlAssessRequest) -> AmlAssessResponse:
    """Scores proposed transactions -- never commits them (see
    POST /api/aml/session/transactions for that separate, explicit step).
    A single transaction is submitted as a one-item list; batches of more
    than one are scored with the sequencing documented in
    ml/aml_baseline/inference.py::score_transactions."""
    targets = [_in_to_record(item) for item in request.transactions]

    ids_seen: set[str] = set()
    for target in targets:
        if target.id in ids_seen:
            raise HTTPException(status_code=409, detail=f"duplicate transaction id within this request: {target.id}")
        ids_seen.add(target.id)

    try:
        history = aml_dataset.all_records_sorted()
    except AmlDatasetError as exc:
        logger.error("AML dataset unavailable: %s", exc)
        raise HTTPException(status_code=500, detail=f"AML dataset is unavailable: {exc}") from exc

    try:
        results = aml_baseline.score_transactions(targets, history)
    except AmlModelUnavailableError as exc:
        logger.error("AML baseline model unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=f"the AML baseline model is not available on this server: {exc}") from exc

    if not results:
        raise HTTPException(status_code=500, detail="scoring produced no results")

    return AmlAssessResponse(
        assessed_at=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        model_version=results[0]["model_version"],
        threshold=results[0]["threshold"],
        not_a_calibrated_probability_note=(
            "score is the model's own probability estimate, not separately calibrated -- "
            "treat it as a ranking score, not a calibrated probability of laundering."
        ),
        results=[
            AmlAssessResultItem(
                transaction_id=r["transaction_id"],
                score=r["score"],
                is_laundering=r["is_laundering"],
                threshold=r["threshold"],
                model_version=r["model_version"],
                features=r["features"],
            )
            for r in results
        ],
    )


@router.post("/session/transactions", response_model=AmlSessionCommitResponse)
def commit_session_transactions(request: AmlSessionCommitRequest) -> AmlSessionCommitResponse:
    """Adds transactions to this process's session-local history (see
    app/services/aml_session.py) -- distinct from /assess, which never
    mutates anything. Rejects any id already present in the base dataset or
    an earlier session commit."""
    try:
        known_ids = aml_dataset.all_known_ids()
    except AmlDatasetError as exc:
        logger.error("AML dataset unavailable: %s", exc)
        raise HTTPException(status_code=500, detail=f"AML dataset is unavailable: {exc}") from exc

    records = [_in_to_record(item) for item in request.transactions]

    ids_in_request: set[str] = set()
    for record in records:
        if record.id in known_ids:
            raise HTTPException(status_code=409, detail=f"transaction id already exists: {record.id}")
        if record.id in ids_in_request:
            raise HTTPException(status_code=409, detail=f"duplicate transaction id within this request: {record.id}")
        ids_in_request.add(record.id)

    for record in records:
        aml_session.commit(record)

    return AmlSessionCommitResponse(
        committed=[_record_to_out(r) for r in records],
        session_transaction_count=len(aml_session.get_session_records()),
    )
