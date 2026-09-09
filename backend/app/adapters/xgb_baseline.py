"""Adapter to the standalone ml/xgb_baseline credit-card fraud model.

This model is trained on anonymized card-present transactions (schema:
`Time`, `V1..V28`, `Amount`) and has no sender/receiver/account structure.
Per backend/README.md: "It cannot be used as a drop-in scorer for this
demo's sender/receiver graph." It is deliberately NOT wired into
`/api/graph` or account risk — it is exposed only as its own endpoint,
scoring rows in its own native schema, so its output can never be confused
with mule-network risk.

`xgboost`/`pandas`/the trained model file are optional dependencies of the
core service: per backend/README.md Stage 2 ("Keep optional ML dependencies
out of startup"), nothing here is imported until the endpoint is actually
called, so a deployment without requirements-xgb.txt installed, or without
a trained model file, still serves /health and /api/graph normally and only
fails the one endpoint that needs them.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Sequence

from app.adapters._ml_path import ensure_ml_on_path

# Matches ml/xgb_baseline/features.py's PCA_FEATURE_COLUMNS convention
# (V1..V28) -- stable, published dataset schema, not expected to change.
V_FEATURE_COUNT = 28


class XgbUnavailableError(Exception):
    """Raised when the xgboost stack or the trained model file isn't available."""


@lru_cache(maxsize=1)
def _load_model() -> Any:
    ensure_ml_on_path()
    try:
        from xgb_baseline.inference import load_model
    except ImportError as exc:
        raise XgbUnavailableError(
            f"xgboost baseline dependencies are not installed on this server: {exc}"
        ) from exc
    try:
        return load_model()
    except FileNotFoundError as exc:
        raise XgbUnavailableError(str(exc)) from exc


def score_row(time_value: float, amount: float, v_features: Sequence[float]) -> dict:
    """Score one row in the model's own native schema (Time, Amount, V1..V28).

    Returns the model's own fraud-probability estimate for a card-present
    transaction -- not a mule-network risk score. See this module's
    docstring and backend/docs/integration-contract.md.
    """
    if len(v_features) != V_FEATURE_COUNT:
        raise ValueError(f"expected exactly {V_FEATURE_COUNT} V-features (V1..V{V_FEATURE_COUNT}), got {len(v_features)}")

    loaded = _load_model()

    try:
        import pandas as pd
        from xgb_baseline.inference import predict
    except ImportError as exc:
        raise XgbUnavailableError(f"xgboost baseline dependencies are not installed on this server: {exc}") from exc

    row = {"Time": time_value, "Amount": amount}
    row.update({f"V{i}": value for i, value in enumerate(v_features, start=1)})
    result = predict(loaded, pd.DataFrame([row]))

    return {
        "score": float(result["score"].iloc[0]),
        "is_fraud": bool(result["is_fraud"].iloc[0]),
        "threshold": float(loaded.threshold),
        "model_mode": "xgboost_card_fraud_baseline",
    }
