"""Adapter to the standalone ml/aml_baseline transaction classifier.

Mirrors backend/app/adapters/xgb_baseline.py's pattern exactly: the model
and its dependencies (xgboost/pandas/etc., from backend/requirements-xgb.txt)
are imported lazily, on first call, not at process startup, so a deployment
without that optional stack (or without a trained model file) still serves
/health, /api/graph, and the AML dataset-browsing endpoints normally, and
only fails the assess endpoint. The model is loaded once per process
(lru_cache) -- never retrained or reloaded per request.

This is the domain-appropriate account-graph model (trained on IBM's
synthetic AML transfer data) -- structurally unrelated to
backend/app/adapters/xgb_baseline.py's card-fraud model. Never mix their
outputs.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Sequence

from app.adapters._ml_path import ensure_ml_on_path
from app.services.aml_types import AmlRecord


class AmlModelUnavailableError(Exception):
    """Raised when the aml_baseline stack or the trained model file isn't available."""


@lru_cache(maxsize=1)
def _load_model() -> Any:
    ensure_ml_on_path()
    try:
        from aml_baseline.inference import load_model
    except ImportError as exc:
        raise AmlModelUnavailableError(
            f"AML baseline model dependencies are not installed on this server: {exc}"
        ) from exc
    try:
        return load_model()
    except FileNotFoundError as exc:
        raise AmlModelUnavailableError(str(exc)) from exc


def _to_ml_transaction(record: AmlRecord):
    ensure_ml_on_path()
    from aml_baseline.features import AmlTransaction

    return AmlTransaction(
        id=record.id,
        sender=record.sender,
        receiver=record.receiver,
        amount_paise=record.amount_paise,
        timestamp=record.timestamp,
        payment_format=record.payment_format,
    )


def _relevant_history(targets: Sequence[AmlRecord], history: Sequence[AmlRecord]) -> Sequence[AmlRecord]:
    """Pre-filters `history` to only records that could possibly affect any
    target's features (shares an account with at least one target) -- a
    correctness-preserving performance optimization: none of the 35 features
    depend on a history record that shares no account with the target being
    scored, since every feature is keyed by sender/receiver/pair."""
    accounts = set()
    for t in targets:
        accounts.add(t.sender)
        accounts.add(t.receiver)
    return [r for r in history if r.sender in accounts or r.receiver in accounts]


def score_transactions(targets: Sequence[AmlRecord], history: Sequence[AmlRecord]) -> list[dict]:
    """Scores `targets` (a single transaction is a batch of one) against
    `history` (already-committed context; never mutated, never includes
    `targets` themselves). See ml/aml_baseline/inference.py::score_transactions
    for the exact batch-sequencing contract (each target sees history plus
    earlier-processed targets from the same call).

    Returns one dict per target, in the same order as `targets`, each with:
    score, is_laundering, threshold, model_version, features (the exact
    feature values used).
    """
    loaded = _load_model()
    from aml_baseline.inference import score_transactions as ml_score_transactions

    ml_targets = [_to_ml_transaction(t) for t in targets]
    ml_history = [_to_ml_transaction(h) for h in _relevant_history(targets, history)]

    results = ml_score_transactions(loaded, ml_targets, ml_history)
    return [
        {
            "transaction_id": r.transaction_id,
            "score": r.score,
            "is_laundering": r.is_laundering,
            "threshold": r.threshold,
            "model_version": r.model_version,
            "features": r.features,
        }
        for r in results
    ]


def model_metadata() -> dict:
    """Model version/threshold/provenance, for the summary endpoint's
    "scoring method" field. Raises AmlModelUnavailableError if not trained."""
    loaded = _load_model()
    return {
        "model_version": loaded.model_version,
        "threshold": loaded.threshold,
        "feature_count": len(loaded.feature_columns),
        "trained_at_utc": loaded.metadata.get("trained_at_utc"),
        "not_a_calibrated_probability_note": loaded.metadata.get("not_a_calibrated_probability_note"),
    }
