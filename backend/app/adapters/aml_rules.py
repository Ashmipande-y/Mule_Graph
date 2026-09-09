"""Adapter to ml/rules for the AML dataset's bounded graph neighborhoods.

Reuses the existing fan-out/convergence detector, but with a dataset-scale
`DetectorConfig` (hours, not the UPI canonical demo's 60 seconds) -- see
`backend/docs/aml-integration-contract.md`. This is a separate, independent
adapter from `backend/app/adapters/ml_rules.py` (pinned to the UPI demo's
60-second config); neither imports the other, and this module never runs
over the full 27,511-row dataset -- only over one bounded neighborhood at a
time (see `app/services/aml_dataset.py::get_neighborhood`).

Findings/account risk from this module are **rules output**, never the
`aml_baseline` XGBoost classifier's output -- keep them labeled as such
wherever displayed (see backend/app/api/aml.py).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from app.adapters._ml_path import ensure_ml_on_path
from app.services.aml_types import AmlRecord

ensure_ml_on_path()

from rules.account_risk import AccountRisk, account_risk_from_findings  # noqa: E402
from rules.detector import DetectorConfig, Finding  # noqa: E402
from rules.replay import evaluate_at  # noqa: E402
from rules.transactions import Transaction  # noqa: E402

__all__ = ["AML_DETECTOR_CONFIG", "assess_neighborhood"]

# Provisional, documented dataset-scale config: a same-business-day
# laundering window for hours/day-granularity ACH/Wire transfers. Chosen to
# be plausible for this data's actual cadence, NOT tuned against any
# specific neighborhood to manufacture a finding -- see
# backend/docs/aml-integration-contract.md. `min_intermediaries` is left at
# the same value as the UPI demo's config since it's a structural choice
# (how many parallel legs define "fan-out"), not a timescale one.
AML_DETECTOR_CONFIG = DetectorConfig(
    min_intermediaries=3,
    fan_out_window_seconds=6 * 3600,
    convergence_window_seconds=6 * 3600,
    max_scoring_window_seconds=24 * 3600,
)


def _to_rules_transaction(record: AmlRecord) -> Transaction:
    dt = datetime.strptime(record.timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    # ml/rules' detector only ever compares amounts as ratios/sums within one
    # consistent unit -- paise works the same as whole rupees here, since
    # nothing in the detector applies an absolute currency threshold.
    return Transaction(timestamp=dt, id=record.id, sender=record.sender, receiver=record.receiver, amount=record.amount_paise)


def assess_neighborhood(records: Sequence[AmlRecord]) -> tuple[list[Finding], dict[str, AccountRisk]]:
    """Runs the fan-out/convergence detector over one bounded neighborhood's
    transactions. Returns (findings, account_risk_by_id) -- both empty if
    `records` is empty. This is the *only* place account-level risk is
    computed for the AML graph; it is rules-derived, structurally identical
    in meaning to the canonical demo's `/api/graph` risk fields, just at a
    different timescale.
    """
    if not records:
        return [], {}
    transactions = [_to_rules_transaction(r) for r in records]
    as_of = max(t.timestamp for t in transactions)
    findings = evaluate_at(transactions, as_of, config=AML_DETECTOR_CONFIG)
    account_risk = account_risk_from_findings(findings)
    return findings, account_risk
