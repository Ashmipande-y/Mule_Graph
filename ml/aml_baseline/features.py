"""Causal feature computation for the AML transaction classifier.

Ports the exact algorithm used to produce the supplied
`ml/data/aml/splits/*_features.csv` (from the prepared dataset package's own
`prepare_mulegraph.py::causal_features`) into a single function usable both
to verify parity against those provided features (see
`ml/aml_baseline/tests/test_features.py`) and to score brand-new,
analyst-entered transactions online.

## Why one function instead of a separate "batch" and "online" path

The original script maintains incremental, mutable rolling-window state
across a chronological pass -- efficient for preparing an entire dataset
once, but awkward to reuse per-request in a stateless service. This module
instead computes each transaction's features by directly filtering its
`history` argument to strictly-earlier entries. The two approaches are
mathematically equivalent: a rolling window's state at the moment a
transaction at time `now` is scored contains exactly the events observed at
times `t < now` that have not yet been expired by a *prior* snapshot at
`now - window_seconds`; since `observe()` for any given minute's
transactions only ever happens after all snapshots for that minute (see the
original script), every event with `t < now` is either still present (if
`t >= now - window_seconds`) or already correctly expired. Direct filtering
over the full history for `now - window_seconds <= t < now` reproduces this
exactly -- verified empirically in the parity test, not just argued here.

## Same-minute and future exclusion

All source timestamps are minute-precision (`YYYY-MM-DDTHH:MM:00Z`), so two
transactions in the same minute have *identical* timestamp strings. Filtering
`history` to entries with `timestamp < target.timestamp` (plain string
comparison, which matches chronological order for this fixed-width ISO 8601
form) simultaneously satisfies both "same minute cannot see itself" and "no
future transaction can be observed": anything with an equal or later
timestamp is excluded by construction.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
from typing import Sequence

# Order IS the contract: must match the supplied splits' feature CSV header
# exactly, and is what the trained model's metadata records as
# `feature_columns` (see train.py). Verified against
# ml/data/aml/splits/train_features.csv's header in
# ml/aml_baseline/tests/test_features.py.
FEATURE_COLUMNS: list[str] = [
    "amount_log1p_inr",
    "is_ach",
    "is_wire",
    "hour_sin",
    "hour_cos",
    "weekday",
    "pair_prior_count",
    "sender_has_prior_activity",
    "sender_seconds_since_prior_activity",
    "sender_out_1h_count",
    "sender_out_1h_distinct_accounts",
    "sender_out_1h_amount_paise",
    "sender_in_1h_count",
    "sender_in_1h_distinct_accounts",
    "sender_in_1h_amount_paise",
    "sender_out_24h_count",
    "sender_out_24h_distinct_accounts",
    "sender_out_24h_amount_paise",
    "sender_in_24h_count",
    "sender_in_24h_distinct_accounts",
    "sender_in_24h_amount_paise",
    "receiver_has_prior_activity",
    "receiver_seconds_since_prior_activity",
    "receiver_out_1h_count",
    "receiver_out_1h_distinct_accounts",
    "receiver_out_1h_amount_paise",
    "receiver_in_1h_count",
    "receiver_in_1h_distinct_accounts",
    "receiver_in_1h_amount_paise",
    "receiver_out_24h_count",
    "receiver_out_24h_distinct_accounts",
    "receiver_out_24h_amount_paise",
    "receiver_in_24h_count",
    "receiver_in_24h_distinct_accounts",
    "receiver_in_24h_amount_paise",
]

_WINDOWS = ((3600, 1), (86400, 24))
TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


class FeatureInputError(Exception):
    """Raised when a transaction or its history is malformed for feature computation."""


@dataclass(frozen=True)
class AmlTransaction:
    """One inter-account transfer in the AML dataset's own schema.

    Deliberately distinct from the canonical demo's `Transaction` type
    (which has a whole-rupee `amount`, no currency/payment_format field) --
    see backend/docs/aml-integration-contract.md for why these are kept as
    separate contracts rather than one field silently reused for two units.
    """

    id: str
    sender: str
    receiver: str
    amount_paise: int
    timestamp: str  # "YYYY-MM-DDTHH:MM:00Z", minute precision
    payment_format: str


def _epoch_seconds(timestamp: str) -> int:
    try:
        dt = datetime.strptime(timestamp, TIMESTAMP_FORMAT).replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise FeatureInputError(f"timestamp {timestamp!r} is not minute-precision UTC ISO 8601") from exc
    return int(dt.timestamp())


def compute_features_for_target(target: AmlTransaction, history: Sequence[AmlTransaction]) -> dict[str, float]:
    """The 35 features for `target`, using only entries of `history` strictly
    earlier than target's minute. `history` need not be sorted or
    pre-filtered to relevant accounts (though callers should pre-filter for
    performance -- see backend/app/adapters/aml_baseline.py). An account
    with no qualifying prior history gets the documented no-history
    defaults: `*_has_prior_activity=0`, `*_seconds_since_prior_activity=-1`,
    and all rolling-window counts/sums at 0 -- never a fabricated value.

    Whether `target` itself is included in some other transaction's history
    is entirely up to the caller's `history` argument -- this function only
    ever looks *backward* from `target`, never at `target` itself as prior
    context for another row.
    """
    target_epoch = _epoch_seconds(target.timestamp)
    dt = datetime.strptime(target.timestamp, TIMESTAMP_FORMAT).replace(tzinfo=timezone.utc)

    # (epoch, tx) computed once, reused for every window/role below.
    prior = [(_epoch_seconds(tx.timestamp), tx) for tx in history if tx.timestamp < target.timestamp]

    feature: dict[str, float] = {
        "amount_log1p_inr": math.log1p(target.amount_paise / 100),
        "is_ach": int(target.payment_format == "ACH"),
        "is_wire": int(target.payment_format == "Wire"),
        "hour_sin": math.sin(2 * math.pi * dt.hour / 24),
        "hour_cos": math.cos(2 * math.pi * dt.hour / 24),
        "weekday": dt.weekday(),
        "pair_prior_count": sum(
            1 for _, tx in prior if tx.sender == target.sender and tx.receiver == target.receiver
        ),
    }

    for role, account in (("sender", target.sender), ("receiver", target.receiver)):
        involved_epochs = [epoch for epoch, tx in prior if tx.sender == account or tx.receiver == account]
        if involved_epochs:
            feature[f"{role}_has_prior_activity"] = 1
            feature[f"{role}_seconds_since_prior_activity"] = target_epoch - max(involved_epochs)
        else:
            feature[f"{role}_has_prior_activity"] = 0
            feature[f"{role}_seconds_since_prior_activity"] = -1

        for seconds, hours in _WINDOWS:
            cutoff = target_epoch - seconds
            for direction in ("out", "in"):
                if direction == "out":
                    window_txs = [tx for epoch, tx in prior if tx.sender == account and epoch >= cutoff]
                    other_of = lambda tx: tx.receiver  # noqa: E731
                else:
                    window_txs = [tx for epoch, tx in prior if tx.receiver == account and epoch >= cutoff]
                    other_of = lambda tx: tx.sender  # noqa: E731
                prefix = f"{role}_{direction}_{hours}h"
                feature[f"{prefix}_count"] = len(window_txs)
                feature[f"{prefix}_distinct_accounts"] = len({other_of(tx) for tx in window_txs})
                feature[f"{prefix}_amount_paise"] = sum(tx.amount_paise for tx in window_txs)

    return feature


def to_feature_vector(feature: dict[str, float]) -> list[float]:
    """`feature` in FEATURE_COLUMNS order, as a plain list (for a DataFrame row or model input)."""
    return [feature[name] for name in FEATURE_COLUMNS]
