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
