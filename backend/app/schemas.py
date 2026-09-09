"""Response models for the Stage 1 static graph API.

Shapes follow docs/api-contract.md exactly: risk fields stay null/UNASSESSED
in this stage, and display labels are authored scenario text, never model
output.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

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


class GraphResponse(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


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


class AmlTransactionIn(BaseModel):
    """One transfer in the AML dataset's own schema -- used both for the
    (rare, dataset-scale) validated input shape and as the request body for
    /assess and /session/transactions."""

    id: str = Field(min_length=1)
    sender: str = Field(min_length=1)
    receiver: str = Field(min_length=1)
    amount_paise: int = Field(gt=0, description="Integer minor units. Divide by 100 for INR.")
    currency: Literal["INR"] = "INR"
    timestamp: str = Field(
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$",
        description="Minute-precision UTC ISO 8601 (seconds fixed at '00'), matching the dataset's own resolution.",
    )
    payment_format: Literal["ACH", "Wire"]


class AmlTransactionOut(AmlTransactionIn):
    """Same shape as the input, echoed back in list/graph responses."""


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
