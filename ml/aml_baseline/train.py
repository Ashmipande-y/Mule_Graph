"""Train the AML transaction classifier and save a self-contained model bundle.

Run with the project-local venv, from the repo root:
    ml/.venv/Scripts/python.exe -m aml_baseline.train
(with PYTHONPATH=ml, or via ml/scripts/run_aml_baseline.py which sets that up)

This is an explicit, offline command -- never run during a request, and
never re-run implicitly by the backend (see
backend/app/adapters/aml_baseline.py, which only loads the saved artifact).
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

from .dataset import LABEL_COLUMN, SplitData, load_all_splits
from .evaluate import choose_threshold_by_f1, compute_report
from .features import FEATURE_COLUMNS

ML_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ML_DIR / "models" / "aml_baseline.joblib"
REPORT_PATH = ML_DIR / "reports" / "aml_baseline_metrics.json"

RANDOM_SEED = 42

DATASET_PROVENANCE = {
    "source": "IBM AML HI-Small v8 (Kaggle: ealtman2019/ibm-transactions-for-anti-money-laundering-aml)",
    "prepared_view": "transfer_inr (ACH/Wire only, INR-denominated rows, chronological train/validation/test split)",
    "domain": "synthetic account-to-account transfers -- IBM synthetic AML benchmark, NOT real UPI customer data",
    "license": "CDLA-Sharing-1.0",
    "see_also": "data/aml/README.md",
}


def train_classifier(X_train, y_train, seed: int = RANDOM_SEED) -> XGBClassifier:
    """Fit the XGBoost classifier. CPU only. scale_pos_weight compensates for
    the severe positive-class rarity (83/16666 ~= 0.50% in train) without
    resampling."""
    counts = np.bincount(np.asarray(y_train).astype(int))
    negative, positive = int(counts[0]), int(counts[1])
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


def _split_summary(name: str, split: SplitData) -> dict:
    return {
        "rows": len(split.features),
        "positive_labels": int(split.labels.sum()),
        "timestamp_min": split.transactions["timestamp"].min(),
        "timestamp_max": split.transactions["timestamp"].max(),
    }


def main() -> int:
    splits = load_all_splits()
    train, validation, test = splits["train"], splits["validation"], splits["test"]

    model = train_classifier(train.features, train.labels, seed=RANDOM_SEED)

    val_prob = model.predict_proba(validation.features)[:, 1]
    threshold = choose_threshold_by_f1(validation.labels, val_prob)
    val_report = compute_report(validation.labels, val_prob, threshold)

    test_prob = model.predict_proba(test.features)[:, 1]
    test_report = compute_report(test.labels, test_prob, threshold)

    metadata = {
        "model_version": "aml_baseline_v1",
        "trained_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feature_columns": FEATURE_COLUMNS,
        "label_column": LABEL_COLUMN,
        "label_mapping": {"0": "not_laundering", "1": "laundering"},
        "seed": RANDOM_SEED,
        "split_description": {
            "method": "chronological (Sep 1-6 train / Sep 7-8 validation / Sep 9-10 test), no shuffling, no stratification",
            "row_counts": {name: _split_summary(name, split) for name, split in splits.items()},
        },
        "dataset_provenance": DATASET_PROVENANCE,
        "threshold": threshold,
        "threshold_selection": "argmax F1 on validation predictions only; never on test",
        "validation_metrics": val_report.to_dict(),
        "test_metrics": test_report.to_dict(),
        "xgboost_version": xgboost.__version__,
        "python_version": platform.python_version(),
        "not_a_calibrated_probability_note": (
            "predict_proba output is the model's own probability estimate, a genuine model output "
            "(unlike ml/rules' hand-defined heuristic), but has not been separately calibrated (e.g. via "
            "Platt scaling or isotonic regression) -- treat it as a ranking score, not a calibrated "
            "probability of laundering, unless calibration is added and evaluated later."
        ),
        "small_test_positive_count_caveat": (
            f"The test split has only {test_report.support_positive} positive (laundering) examples. "
            "Any recall/precision figure computed from this few positives carries substantial sampling "
            "uncertainty -- a single additional true/false positive changes recall by "
            f"{round(1 / max(test_report.support_positive, 1) * 100, 1)} percentage points. Treat these "
            "test metrics as a directional signal, not a precise performance guarantee, and re-evaluate "
            "on a larger labeled set before relying on them operationally."
        ),
        "not_the_mulegraph_upi_domain_note": (
            "This model is trained on IBM's synthetic AML benchmark (ACH/Wire transfers), not real UPI "
            "transaction data. It is a domain-appropriate account-graph model (unlike ml/xgb_baseline's "
            "unrelated card-fraud model), but its performance here should not be read as a claim about "
            "real-world UPI mule-detection accuracy."
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
