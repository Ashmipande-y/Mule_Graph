"""Train the CPU XGBoost baseline and save a self-contained model bundle.

Run with the project-local venv, from the repo root:
    ml/.venv/Scripts/python.exe -m xgb_baseline.train
(with PYTHONPATH=ml, or via ml/scripts/run_xgb_baseline.py which sets that up)
"""

from __future__ import annotations

import datetime
import json
import platform
from pathlib import Path

import joblib
import numpy as np
import xgboost
from xgboost import XGBClassifier

from .dataset import (
    EXPECTED_FRAUD_COUNT,
    EXPECTED_ROW_COUNT,
    LABEL_COLUMN,
    RAW_DATA_PATH,
    TRAIN_FRACTION,
    VALIDATION_FRACTION,
    chronological_split,
    load_raw,
)
from .evaluate import choose_threshold_by_f1, compute_report
from .features import FEATURE_COLUMNS, extract_features

ML_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ML_DIR / "models" / "xgb_baseline.joblib"
REPORT_PATH = ML_DIR / "reports" / "xgb_baseline_metrics.json"

RANDOM_SEED = 42

DATASET_PROVENANCE = {
    "source": "OpenML dataset id 1597 ('creditcard')",
    "source_url": "https://www.openml.org/search?type=data&id=1597",
    "download_url": "https://data.openml.org/datasets/0000/1597/dataset_1597.pq",
    "license": "Public (as recorded by OpenML)",
    "original_citation": (
        "Andrea Dal Pozzolo, Olivier Caelen, Reid A. Johnson, Gianluca Bontempi, "
        "'Calibrating Probability with Undersampling for Unbalanced Classification', "
        "IEEE Symposium on Computational Intelligence and Data Mining (CIDM), 2015"
    ),
    "domain": "real (not synthetic) European credit-card transactions, September 2013",
    "not_the_mulegraph_domain": (
        "This is card-payment fraud, not account-to-account money-laundering / "
        "mule-network fraud, and has no account graph structure at all."
    ),
    "verified_row_count": EXPECTED_ROW_COUNT,
    "verified_fraud_count": EXPECTED_FRAUD_COUNT,
    "verified_md5": "1593844f40edbdabaf5bddec4649e1c4",
}


def train_baseline(X_train, y_train, seed: int = RANDOM_SEED) -> XGBClassifier:
    """Fit the XGBoost classifier. CPU only: tree_method='hist' with no GPU
    device selected. scale_pos_weight compensates for the ~0.17% positive
    rate without resampling (resampling would need to be fit-on-train-only
    too, but weighting avoids the extra moving part entirely)."""
    negative, positive = np.bincount(np.asarray(y_train).astype(int))
    scale_pos_weight = negative / positive

    model = XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        tree_method="hist",
        device="cpu",
        eval_metric="aucpr",
        scale_pos_weight=scale_pos_weight,
        random_state=seed,
        n_jobs=0,
    )
    model.fit(X_train, y_train)
    return model


def main() -> int:
    df = load_raw(RAW_DATA_PATH)
    split = chronological_split(df)

    X_train = extract_features(split.train)
    y_train = split.train[LABEL_COLUMN].astype(int)
    X_val = extract_features(split.validation)
    y_val = split.validation[LABEL_COLUMN].astype(int)
    X_test = extract_features(split.test)
    y_test = split.test[LABEL_COLUMN].astype(int)

    model = train_baseline(X_train, y_train, seed=RANDOM_SEED)

    val_prob = model.predict_proba(X_val)[:, 1]
    threshold = choose_threshold_by_f1(y_val, val_prob)
    val_report = compute_report(y_val, val_prob, threshold)

    test_prob = model.predict_proba(X_test)[:, 1]
    test_report = compute_report(y_test, test_prob, threshold)

    metadata = {
        "trained_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feature_columns": FEATURE_COLUMNS,
        "label_column": LABEL_COLUMN,
        "label_mapping": {"0": "legitimate", "1": "fraud"},
        "seed": RANDOM_SEED,
        "split_description": {
            "method": "chronological, no shuffling, no stratification",
            "train_fraction": TRAIN_FRACTION,
            "validation_fraction": VALIDATION_FRACTION,
            "test_fraction": round(1 - TRAIN_FRACTION - VALIDATION_FRACTION, 4),
            "evaluation_style": "inductive (temporal): validation and test transactions all occur "
            "strictly after every training transaction within the dataset's two-day window",
            "row_counts": {"train": len(split.train), "validation": len(split.validation), "test": len(split.test)},
            "fraud_counts": {
                "train": int(y_train.sum()),
                "validation": int(y_val.sum()),
                "test": int(y_test.sum()),
            },
        },
        "dataset_provenance": DATASET_PROVENANCE,
        "threshold": threshold,
        "threshold_selection": "argmax F1 on validation predictions only; never on test",
        "validation_metrics": val_report.to_dict(),
        "test_metrics": test_report.to_dict(),
        "xgboost_version": xgboost.__version__,
        "python_version": platform.python_version(),
        "not_a_calibrated_probability_note": (
            "predict_proba output is the model's own probability estimate, which IS a "
            "genuine model output (unlike ml/rules' heuristic score) but has not been "
            "separately calibrated (e.g. via Platt scaling or isotonic regression) -- "
            "treat it as a ranking score unless calibration is added later."
        ),
    }

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "metadata": metadata}, MODEL_PATH)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Model saved to {MODEL_PATH}")
    print(f"Report saved to {REPORT_PATH}")
    print(f"Chosen threshold (validation F1-optimal): {threshold}")
    print("Validation metrics:", json.dumps(val_report.to_dict(), indent=2))
    print("Test metrics:", json.dumps(test_report.to_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
