"""Deterministic fan-out -> convergence detector.

Pattern: one source account sends to several distinct intermediary accounts
within a short window (fan-out), and a common threshold of those
intermediaries then forward money to one common collector account, also
within a short window, after receiving it (convergence).

This module has no knowledge of any specific account id, label, or the demo
fixture. Every account id it ever sees comes from the transactions passed
in. Thresholds are configuration, not constants baked into the logic, so the
same code can be pointed at a different dataset without modification.

The `score` this module produces is a hand-defined heuristic combining three
observable ratios (see `Finding.score_method` and `Finding.evidence`). It is
NOT a calibrated probability of fraud, NOT a trained model's output, and NOT
a measured performance metric of anything. It is a way to rank findings by
how strongly the observed evidence matches the fan-out/convergence pattern,
nothing more. Treat it the same way you'd treat a heuristic sort key.
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Sequence

from .transactions import Transaction, deduplicate_by_id


@dataclass(frozen=True)
class DetectorConfig:
    """Thresholds for the fan-out/convergence pattern. All are explicit and
    tunable; none are derived from any specific dataset."""

    # Minimum number of distinct intermediaries required on both sides
    # (fan-out from the source, and convergence onto the collector) for a
    # candidate group to be reported at all.
    min_intermediaries: int = 3

    # A fan-out group is a source account's outgoing transactions that fall
    # within this many seconds of the first transaction in the group.
    fan_out_window_seconds: int = 60

    # From the moment an intermediary receives a fan-out transaction, a
    # subsequent outgoing transaction from that intermediary counts as
    # convergence evidence only if it occurs within this many seconds.
    convergence_window_seconds: int = 60

    # Used only to normalize the time-compactness term of the score into
    # [0, 1]; does not gate whether a finding is reported.
    max_scoring_window_seconds: int = 120


@dataclass(frozen=True)
class Finding:
    """A network-level piece of evidence: this pattern, at these accounts,
    backed by these specific transactions."""

    pattern: str
    source_account: str
    collector_account: str
    intermediary_accounts: tuple[str, ...]
    fan_out_transaction_ids: tuple[str, ...]
    convergence_transaction_ids: tuple[str, ...]
    window_start: datetime.datetime
    window_end: datetime.datetime
    score: float
    score_method: str
    evidence: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "pattern": self.pattern,
            "source_account": self.source_account,
            "collector_account": self.collector_account,
            "intermediary_accounts": list(self.intermediary_accounts),
            "fan_out_transaction_ids": list(self.fan_out_transaction_ids),
            "convergence_transaction_ids": list(self.convergence_transaction_ids),
            "window_start": self.window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "window_end": self.window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "score": self.score,
            "score_method": self.score_method,
            "evidence": self.evidence,
            "score_is_not_a_probability": True,
        }


_SCORE_METHOD = (
    "heuristic_v1 = 0.5*intermediary_ratio + 0.3*amount_conservation + 0.2*time_compactness, "
    "clipped to [0, 1]. A hand-defined evidence-strength ranking score, not a calibrated "
    "probability, not a trained model output, and not a measured performance metric."
)


def _fan_out_groups(source: str, outgoing: list[Transaction], config: DetectorConfig):
    """Yield candidate fan-out groups for one source account.

    `outgoing` must already be sorted by timestamp. Each group is anchored at
    one starting transaction and extends forward while still inside the
    fan-out window, so overlapping windows starting at different transactions
    are all considered as separate candidates (deduplicated later).
    """
    n = len(outgoing)
    for i in range(n):
        window_end_time = outgoing[i].timestamp + datetime.timedelta(seconds=config.fan_out_window_seconds)
        group: list[Transaction] = [outgoing[i]]
        for j in range(i + 1, n):
            if outgoing[j].timestamp > window_end_time:
                break
            if outgoing[j].receiver == source:
                continue  # a transfer back to itself is not a fan-out edge
            group.append(outgoing[j])

        by_receiver: dict[str, list[Transaction]] = defaultdict(list)
        for tx in group:
            by_receiver[tx.receiver].append(tx)

        if len(by_receiver) >= config.min_intermediaries:
            yield by_receiver


def detect_fan_out_convergence(
    transactions: Sequence[Transaction],
    config: DetectorConfig | None = None,
) -> list[Finding]:
    """Detect fan-out -> convergence patterns in the given transactions.

    Callers doing replay must pre-filter `transactions` to what was
    observable at the evaluation time (see replay.evaluate_at) — this
    function has no notion of "now" and will use every transaction it is
    given, in either direction of time, as evidence.
    """
    config = config or DetectorConfig()
    txs = deduplicate_by_id(transactions)  # duplicate input records must not inflate evidence

    by_sender: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        by_sender[tx.sender].append(tx)
    for sender_txs in by_sender.values():
        sender_txs.sort()

    findings: dict[tuple[str, str, tuple[str, ...]], Finding] = {}

    for source, outgoing in by_sender.items():
        for fan_out_by_intermediary in _fan_out_groups(source, outgoing, config):
            intermediaries = sorted(fan_out_by_intermediary)

            # For each intermediary, the fan-out transaction it is credited
            # with is the last one it received within this group (money must
            # have actually arrived before it can be forwarded on).
            fan_out_tx_for = {m: fan_out_by_intermediary[m][-1] for m in intermediaries}

            # collector -> intermediary -> earliest qualifying convergence tx
            convergence_candidates: dict[str, dict[str, Transaction]] = defaultdict(dict)
            for intermediary in intermediaries:
                received_at = fan_out_tx_for[intermediary].timestamp
                latest_allowed = received_at + datetime.timedelta(seconds=config.convergence_window_seconds)
                for tx in by_sender.get(intermediary, []):
                    if tx.timestamp <= received_at:
                        continue  # must be forwarded strictly after it was received
                    if tx.timestamp > latest_allowed:
                        continue
                    if tx.receiver == source or tx.receiver in fan_out_by_intermediary:
                        continue  # collector must be distinct from the source and the intermediaries
                    existing = convergence_candidates[tx.receiver].get(intermediary)
                    if existing is None or tx.timestamp < existing.timestamp:
                        convergence_candidates[tx.receiver][intermediary] = tx

            for collector, per_intermediary in convergence_candidates.items():
                if len(per_intermediary) < config.min_intermediaries:
                    continue

                converging = sorted(per_intermediary)
                fan_out_txs = [fan_out_tx_for[m] for m in converging]
                convergence_txs = [per_intermediary[m] for m in converging]

                window_start = min(t.timestamp for t in fan_out_txs)
                window_end = max(t.timestamp for t in convergence_txs)
                window_span_seconds = (window_end - window_start).total_seconds()

                total_fan_out_amount = sum(t.amount for t in fan_out_txs)
                total_convergence_amount = sum(t.amount for t in convergence_txs)

                intermediary_ratio = len(converging) / len(intermediaries)
                amount_conservation = (
                    min(1.0, total_convergence_amount / total_fan_out_amount) if total_fan_out_amount else 0.0
                )
                time_compactness = max(0.0, 1.0 - min(1.0, window_span_seconds / config.max_scoring_window_seconds))

                score = 0.5 * intermediary_ratio + 0.3 * amount_conservation + 0.2 * time_compactness
                score = round(min(1.0, max(0.0, score)), 4)

                key = (source, collector, tuple(converging))
                candidate = Finding(
                    pattern="fan_out_convergence",
                    source_account=source,
                    collector_account=collector,
                    intermediary_accounts=tuple(converging),
                    fan_out_transaction_ids=tuple(t.id for t in fan_out_txs),
                    convergence_transaction_ids=tuple(t.id for t in convergence_txs),
                    window_start=window_start,
                    window_end=window_end,
                    score=score,
                    score_method=_SCORE_METHOD,
                    evidence={
                        "intermediary_ratio": round(intermediary_ratio, 4),
                        "amount_conservation": round(amount_conservation, 4),
                        "time_compactness": round(time_compactness, 4),
                        "total_fan_out_amount": total_fan_out_amount,
                        "total_convergence_amount": total_convergence_amount,
                        "window_span_seconds": window_span_seconds,
                        "fan_out_window_seconds": config.fan_out_window_seconds,
                        "convergence_window_seconds": config.convergence_window_seconds,
                    },
                )

                existing = findings.get(key)
                if existing is None or candidate.score > existing.score:
                    findings[key] = candidate

    return sorted(findings.values(), key=lambda f: (-f.score, f.source_account, f.collector_account))
