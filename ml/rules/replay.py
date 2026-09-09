"""Replay: evaluate the detector using only transactions observable at a
given point in time.

This module exists to make one property structural rather than a matter of
discipline: a snapshot taken "as of" some timestamp can never see a
transaction that happens after it. That guarantee matters because the same
detector will later be asked to score a network at the moment an alert would
have fired in production, not with the benefit of hindsight.
"""

from __future__ import annotations

import datetime
from typing import Sequence

from .detector import DetectorConfig, Finding, detect_fan_out_convergence
from .transactions import Transaction


def observable_transactions(transactions: Sequence[Transaction], as_of: datetime.datetime) -> list[Transaction]:
    """Return only the transactions with timestamp <= as_of, chronologically sorted.

    `as_of` must be timezone-aware (UTC), matching Transaction.timestamp.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware (UTC)")
    return sorted(t for t in transactions if t.timestamp <= as_of)


def evaluate_at(
    transactions: Sequence[Transaction],
    as_of: datetime.datetime,
    config: DetectorConfig | None = None,
) -> list[Finding]:
    """Run the fan-out/convergence detector against a replay snapshot.

    This is the only supported way to score "as of" a point in time: it
    filters to observable transactions first, then detects, so a caller
    cannot accidentally leak future transactions into an earlier snapshot's
    findings.
    """
    snapshot = observable_transactions(transactions, as_of)
    return detect_fan_out_convergence(snapshot, config=config)
