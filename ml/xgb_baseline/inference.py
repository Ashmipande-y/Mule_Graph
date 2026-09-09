"""Standalone inference: load a saved model bundle and score new rows.

Deliberately does not import train.py -- inference must work from the saved
artifact alone, the way a future backend integration would use it, without
needing the training pipeline in memory.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd

from .features import extract_features

ML_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = ML_DIR / "models" / "xgb_baseline.joblib"


@dataclass(frozen=True)
class LoadedModel:
    model: object
    feature_columns: list
    threshold: float
    metadata: dict


def load_model(path: Path = DEFAULT_MODEL_PATH) -> LoadedModel:
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Train it first: python -m xgb_baseline.train")
    bundle = joblib.load(path)
    metadata = bundle["metadata"]
    return LoadedModel(
        model=bundle["model"],
        feature_columns=metadata["feature_columns"],
        threshold=metadata["threshold"],
        metadata=metadata,
    )


def predict(loaded: LoadedModel, rows: pd.DataFrame) -> pd.DataFrame:
    """Score raw rows (same schema as the source dataset: Time, V1..V28,
    Amount -- Class not required). Returns a DataFrame with `score` (the
    model's fraud probability estimate) and `is_fraud` (score >= the
    threshold chosen on validation data at training time).

    `score` is a genuine model output, not a hand-defined heuristic like
    ml/rules' Finding.score -- but see the "not_a_calibrated_probability_note"
    in the saved metadata: it has not been separately calibrated.
    """
    features = extract_features(rows)
    if list(features.columns) != loaded.feature_columns:
        raise ValueError(
            f"feature mismatch: model expects {loaded.feature_columns}, got {list(features.columns)}"
        )
    scores = loaded.model.predict_proba(features)[:, 1]
    return pd.DataFrame(
        {
            "score": scores,
            "is_fraud": scores >= loaded.threshold,
        },
        index=rows.index,
    )
