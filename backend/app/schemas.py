"""Response models for the Stage 1 static graph API.

Shapes follow docs/api-contract.md exactly: risk fields stay null/UNASSESSED
in this stage, and display labels are authored scenario text, never model
output.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

RiskLevel = Literal["UNASSESSED", "LOW", "MEDIUM", "HIGH"]


class Node(BaseModel):
    id: str
    label: str
    risk_score: float | None = None
    risk_level: RiskLevel = "UNASSESSED"


class Edge(BaseModel):
    id: str
    source: str
    target: str
    amount: int
    timestamp: str


class GraphFinding(BaseModel):
    """A network-level piece of evidence backing one or more nodes' risk
    fields -- the same shape `ml/rules/detector.py::Finding.to_dict()`
    produces, serialized in full (not reconstructed from risk scores alone)
    so the frontend can derive real alerts/cases from it instead of treating
    `GET /api/graph` as risk-only. See `backend/docs/integration-contract.md`
    (2026-09-09 entry on this field)."""

    pattern: str
    source_account: str
    collector_account: str
    intermediary_accounts: list[str]
    fan_out_transaction_ids: list[str]
    convergence_transaction_ids: list[str]
    window_start: str
    window_end: str
    score: float
    score_method: str
    evidence: dict


class GraphResponse(BaseModel):
    nodes: list[Node]
    edges: list[Edge]
    findings: list[GraphFinding] = []


# ---------------------------------------------------------------------------
# POST /api/assess -- stateless network-context risk assessment for a
# caller-supplied canonical-demo transaction set (whole-rupee `amount`, same
# schema as Edge/data/demo_transactions.json -- NOT the AML dataset's
# `amount_paise` schema below). Implements
# frontend/docs/assessment-endpoint-contract.md. See app/api/assess.py.
# ---------------------------------------------------------------------------


class AssessTransactionIn(BaseModel):
    """One transaction in the canonical demo's own schema. `amount` is
    strict to avoid the same silent-coercion class of bug fixed for the AML
    schema above: a JSON boolean or a fractional/string number must be
    rejected, never quietly turned into an integer."""

    id: str = Field(min_length=1)
    sender: str = Field(min_length=1)
    receiver: str = Field(min_length=1)
    amount: int = Field(
        gt=0,
        strict=True,
        description="Integer INR rupees (not paise -- this is the canonical demo, not the AML dataset).",
    )
    timestamp: str = Field(min_length=1, description="Full UTC ISO 8601, second precision, e.g. 2026-01-01T10:00:00Z.")


class AssessRequest(BaseModel):
    transactions: list[AssessTransactionIn] = Field(min_length=1, max_length=500)


class AssessAccountResult(BaseModel):
    account_id: str
    risk_score: float | None
    risk_level: RiskLevel
    roles: list[str]
    finding_count: int
    evidence_transaction_ids: list[str]


class AssessPatternResult(BaseModel):
    pattern: str
    source_account: str
    collector_account: str
    intermediary_accounts: list[str]
    score: float
    score_method: str
    evidence: dict


class AssessResponse(BaseModel):
    status: Literal["completed", "partial", "failed"] = "completed"
    assessed_at: str
    model_mode: Literal["rules"] = "rules"
    accounts: list[AssessAccountResult]
    accounts_requiring_review: list[str]
    patterns: list[AssessPatternResult]
    findings: list[GraphFinding] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class XgbScoreRequest(BaseModel):
    """One row in the ml/xgb_baseline model's own native schema.

    This is card-present transaction data (OpenML dataset 1597), NOT a
    MuleGraph account/transaction -- there is no sender/receiver/account_id
    here on purpose. See backend/docs/integration-contract.md.
    """

    time: float = Field(description="Seconds since the first transaction in the source dataset window.")
    amount: float = Field(ge=0, description="Transaction amount in the source dataset's currency unit.")
    v: list[float] = Field(min_length=28, max_length=28, description="V1..V28, the anonymized PCA features, in order.")


class XgbScoreResponse(BaseModel):
    score: float
    is_fraud: bool
    threshold: float
    model_mode: Literal["xgboost_card_fraud_baseline"]


# ---------------------------------------------------------------------------
# AML dataset endpoints (IBM synthetic AML benchmark -- NOT real UPI data).
# A separate contract from the canonical demo's Node/Edge above: amounts are
# integer `amount_paise` (never the whole-rupee `amount` field), and every
# transaction carries `currency`/`payment_format`. See
# backend/docs/aml-integration-contract.md.
# ---------------------------------------------------------------------------

AML_TIMESTAMP_PATTERN = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$"
_AML_TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def is_valid_aml_timestamp(value: str) -> bool:
    """True only for a real minute-precision UTC calendar date/time.

    `AML_TIMESTAMP_PATTERN` alone checks digit shape, not calendar validity
    -- "2022-02-30T25:99:00Z" matches it (2 digits in every slot) but is not
    a real date/time. An actual `strptime` parse is required to catch
    invalid months, days-per-month (including leap years), hours, and
    minutes. Shared by `AmlTransactionIn` (below) and
    `app.services.aml_dataset.validate_record` so both the API request path
    and the CSV dataset-loading path apply the identical rule.
    """
    if not re.match(AML_TIMESTAMP_PATTERN, value):
        return False
    try:
        datetime.strptime(value, _AML_TIMESTAMP_FORMAT)
    except ValueError:
        return False
    return True


class AmlTransactionIn(BaseModel):
    """One transfer in the AML dataset's own schema -- used both for the
    (rare, dataset-scale) validated input shape and as the request body for
    /assess and /session/transactions."""

    id: str = Field(min_length=1)
    sender: str = Field(min_length=1)
    receiver: str = Field(min_length=1)
    amount_paise: int = Field(
        gt=0,
        strict=True,
        description=(
            "Integer minor units. Divide by 100 for INR. Strict: rejects booleans "
            "(bool is an int subclass in Python), fractional numbers, and numeric "
            "strings -- only a genuine JSON integer is accepted."
        ),
    )
    currency: Literal["INR"] = "INR"
    timestamp: str = Field(
        pattern=AML_TIMESTAMP_PATTERN,
        description="Minute-precision UTC ISO 8601 (seconds fixed at '00'), matching the dataset's own resolution.",
    )
    payment_format: Literal["ACH", "Wire"]

    @field_validator("timestamp")
    @classmethod
    def _timestamp_must_be_a_real_calendar_date(cls, value: str) -> str:
        if not is_valid_aml_timestamp(value):
            raise ValueError(
                "not a real calendar date/time (check month/day-of-month/hour/minute ranges); "
                "e.g. 2022-02-30T00:00:00Z and 2022-01-01T25:00:00Z are both rejected"
            )
        return value


class AmlTransactionOut(AmlTransactionIn):
    """Same shape as the input, echoed back in list/graph responses."""

    is_labeled_laundering: bool = Field(
        default=False,
        description=(
            "The IBM AMLworld benchmark's own ground-truth is_laundering=1 label for this id "
            "(data/aml/transfer_labels_and_splits.csv) -- NOT ml/rules or ml/aml_baseline output. "
            "Always false for a freshly session-committed transaction. Computed server-side; not client-settable."
        ),
    )


class AmlDatasetSummaryResponse(BaseModel):
    label: Literal["IBM synthetic AML benchmark"] = "IBM synthetic AML benchmark"
    source: str
    currency: Literal["INR"] = "INR"
    amount_unit: str
    timestamp_timezone_note: str
    total_transactions: int
    total_accounts: int
    period_start: str | None
    period_end: str | None
    session_transaction_count: int
    scoring_method: str
    model_available: bool
    model_version: str | None = None


class AmlTransactionListResponse(BaseModel):
    items: list[AmlTransactionOut]
    next_cursor: int | None
    total_matching: int


class AmlGraphNode(BaseModel):
    id: str
    label: str
    risk_score: float | None = None
    risk_level: RiskLevel = "UNASSESSED"


class AmlRulesFinding(BaseModel):
    """A rules-engine (ml/rules) network finding -- explicitly NOT the
    aml_baseline XGBoost classifier's output. See AML_DETECTOR_CONFIG in
    backend/app/adapters/aml_rules.py for the dataset-scale window used."""

    pattern: str
    source_account: str
    collector_account: str
    intermediary_accounts: list[str]
    score: float
    score_method: str
    evidence: dict


class AmlGraphResponse(BaseModel):
    nodes: list[AmlGraphNode]
    edges: list[AmlTransactionOut]
    seed_account: str | None
    rules_findings: list[AmlRulesFinding]
    dataset_label: Literal["IBM synthetic AML benchmark"] = "IBM synthetic AML benchmark"


class AmlLabeledNetwork(BaseModel):
    """One real, benchmark-labeled neighborhood -- discovered from
    data/aml/transfer_labels_and_splits.csv ground truth, not ml/rules. See
    AmlLabeledNetworksResponse.source_note."""

    seed_account: str
    labeled_laundering_transaction_count: int
    account_count: int
    edge_count: int
    ml_rules_risk_level: RiskLevel = "UNASSESSED"


class AmlLabeledNetworksResponse(BaseModel):
    source_note: str
    networks: list[AmlLabeledNetwork]


class AmlAssessRequest(BaseModel):
    transactions: list[AmlTransactionIn] = Field(min_length=1, max_length=100)


class AmlAssessResultItem(BaseModel):
    transaction_id: str
    score: float
    is_laundering: bool
    threshold: float
    model_version: str
    features: dict[str, float]


class AmlAssessResponse(BaseModel):
    status: Literal["completed"] = "completed"
    assessed_at: str
    model_version: str
    threshold: float
    not_a_calibrated_probability_note: str
    results: list[AmlAssessResultItem]


class AmlSessionCommitRequest(BaseModel):
    transactions: list[AmlTransactionIn] = Field(min_length=1, max_length=100)


class AmlSessionCommitResponse(BaseModel):
    committed: list[AmlTransactionOut]
    session_transaction_count: int
