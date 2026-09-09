"""Metrics and threshold selection.

Deliberately a separate copy from `ml/xgb_baseline/evaluate.py` (same
generic logic, no shared import) -- see CLAUDE.md: this artifact stays
self-contained rather than coupling two otherwise-unrelated model packages.

Threshold selection uses validation data only, never test data. Test
metrics are reported once, at the end, using the threshold chosen on
validation -- they are not used to pick or adjust anything.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


@dataclass(frozen=True)
class ClassificationReport:
    threshold: float
    precision: float
    recall: float
    f1: float
    pr_auc: float
    roc_auc: float | None
    roc_auc_undefined_reason: str | None
    support_positive: int
    support_negative: int
    confusion_matrix: list  # [[tn, fp], [fn, tp]]

    def to_dict(self) -> dict:
        return {
            "threshold": self.threshold,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "pr_auc": self.pr_auc,
            "roc_auc": self.roc_auc,
            "roc_auc_undefined_reason": self.roc_auc_undefined_reason,
            "support_positive": self.support_positive,
            "support_negative": self.support_negative,
            "confusion_matrix": self.confusion_matrix,
        }


def _safe_roc_auc(y_true: np.ndarray, y_prob: np.ndarray) -> tuple[float | None, str | None]:
    if len(set(y_true.tolist())) < 2:
        return None, "only one class present in this split; AUROC is undefined"
    return float(roc_auc_score(y_true, y_prob)), None


def compute_report(y_true, y_prob, threshold: float) -> ClassificationReport:
    """Compute the full metric set at a fixed decision threshold."""
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    y_pred = (y_prob >= threshold).astype(int)

    support_positive = int((y_true == 1).sum())
    support_negative = int((y_true == 0).sum())

    if support_positive == 0 or support_negative == 0:
        precision = recall = f1 = 0.0
        pr_auc = 0.0
        roc_auc, roc_reason = None, "only one class present in this split; metrics below are not meaningful"
    else:
        precision = float(precision_score(y_true, y_pred, zero_division=0))
        recall = float(recall_score(y_true, y_pred, zero_division=0))
        f1 = float(f1_score(y_true, y_pred, zero_division=0))
        pr_auc = float(average_precision_score(y_true, y_prob))
        roc_auc, roc_reason = _safe_roc_auc(y_true, y_prob)

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()

    return ClassificationReport(
        threshold=threshold,
        precision=precision,
        recall=recall,
        f1=f1,
        pr_auc=pr_auc,
        roc_auc=roc_auc,
        roc_auc_undefined_reason=roc_reason,
        support_positive=support_positive,
        support_negative=support_negative,
        confusion_matrix=cm,
    )


def choose_threshold_by_f1(y_val, y_val_prob, candidate_thresholds=None) -> float:
    """Pick the decision threshold that maximizes F1 on validation data only.

    Never call this with test data. The candidate grid defaults to a fine
    sweep over [0.01, 0.99]; ties are broken by preferring the higher
    threshold (fewer false positives), a deliberate, documented choice.
    """
    y_val = np.asarray(y_val).astype(int)
    y_val_prob = np.asarray(y_val_prob).astype(float)

    if candidate_thresholds is None:
        candidate_thresholds = np.linspace(0.01, 0.99, 99)

    best_threshold = 0.5
    best_f1 = -1.0
    for t in candidate_thresholds:
        y_pred = (y_val_prob >= t).astype(int)
        f1 = f1_score(y_val, y_pred, zero_division=0)
        if f1 > best_f1 or (f1 == best_f1 and t > best_threshold):
            best_f1 = f1
            best_threshold = float(t)

    return best_threshold
