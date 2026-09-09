"""Standalone inference: load a saved AML model bundle and score transactions.

Deliberately does not import train.py -- inference must work from the saved
artifact alone. Loading is expected to happen once per process (see
backend/app/adapters/aml_baseline.py); training never happens here or on
any request.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import joblib
import pandas as pd

from .features import FEATURE_COLUMNS, AmlTransaction, compute_features_for_target, to_feature_vector

ML_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = ML_DIR / "models" / "aml_baseline.joblib"


@dataclass(frozen=True)
class LoadedAmlModel:
    model: object
    feature_columns: list
    threshold: float
    model_version: str
    metadata: dict


def load_model(path: Path = DEFAULT_MODEL_PATH) -> LoadedAmlModel:
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Train it first: python -m aml_baseline.train")
    bundle = joblib.load(path)
    metadata = bundle["metadata"]
    return LoadedAmlModel(
        model=bundle["model"],
        feature_columns=metadata["feature_columns"],
        threshold=metadata["threshold"],
        model_version=metadata.get("model_version", "unknown"),
        metadata=metadata,
    )


@dataclass(frozen=True)
class ScoredTransaction:
    transaction_id: str
    score: float
    is_laundering: bool
    threshold: float
    model_version: str
    features: dict  # exact feature values used, for display/audit -- never fabricated


def score_features(loaded: LoadedAmlModel, feature_rows: pd.DataFrame) -> pd.DataFrame:
    """Scores already-computed feature rows (columns must exactly match
    `loaded.feature_columns`, in order)."""
    if list(feature_rows.columns) != loaded.feature_columns:
        raise ValueError(
            f"feature mismatch: model expects {loaded.feature_columns}, got {list(feature_rows.columns)}"
        )
    scores = loaded.model.predict_proba(feature_rows)[:, 1]
    return pd.DataFrame({"score": scores, "is_laundering": scores >= loaded.threshold}, index=feature_rows.index)


def score_transactions(
    loaded: LoadedAmlModel,
    targets: Sequence[AmlTransaction],
    history: Sequence[AmlTransaction],
) -> list[ScoredTransaction]:
    """Scores `targets` (one call handles both the single- and
    batch-transaction case -- a single assessment is just a batch of one).

    Explicit, documented behavior: a proposed transaction is scored *before*
    being added to any committed history (`history` here is read-only,
    already-committed context -- see backend/app/services/aml_session.py for
    the separate "add to session" step). Within one batch call, targets are
    processed in chronological (timestamp, id) order, and each target's
    features see `history` plus whichever earlier targets in the *same*
    batch have already been processed -- exactly as if they had been
    assessed one at a time, in order. Same-minute batch entries still cannot
    see each other, since feature computation excludes non-strictly-earlier
    timestamps regardless of processing order.
    """
    ordered = sorted(targets, key=lambda t: (t.timestamp, t.id))
    working_history: list[AmlTransaction] = list(history)
    results: dict[str, ScoredTransaction] = {}

    for target in ordered:
        feature = compute_features_for_target(target, working_history)
        vector = pd.DataFrame([to_feature_vector(feature)], columns=FEATURE_COLUMNS)
        scored = score_features(loaded, vector).iloc[0]
        results[target.id] = ScoredTransaction(
            transaction_id=target.id,
            score=float(scored["score"]),
            is_laundering=bool(scored["is_laundering"]),
            threshold=loaded.threshold,
            model_version=loaded.model_version,
            features=feature,
        )
        working_history.append(target)

    # Preserve the caller's original request order in the response, not the
    # internal chronological processing order.
    return [results[t.id] for t in targets]
