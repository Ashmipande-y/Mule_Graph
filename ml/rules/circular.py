"""Circular transfer pattern detector.

Pattern: A sequence of directed transfers starting at account A, flowing through
one or more intermediary accounts, and returning to account A (or an immediate
affiliate) within a bounded time window, retaining a substantial fraction of the
original amount.

Common money laundering typologies:
- Wash trading / artificial volume generation
- Round-tripping funds to obscure audit trails while maintaining ownership
- Verification of mule accounts via small loop tests
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Sequence

from .detector import Finding
from .transactions import Transaction, deduplicate_by_id


@dataclass(frozen=True)
class CircularConfig:
    """Thresholds for the circular transfer pattern."""

    # Minimum number of hops in the cycle (e.g. 2 for A->B->A, 3 for A->B->C->A)
    min_cycle_length: int = 2

    # Maximum number of hops to search (bounds search depth)
    max_cycle_length: int = 5

    # Maximum delay allowed between consecutive hops in seconds
    max_hop_delay_seconds: int = 60

    # Maximum total duration of the cycle from first to last transfer
    max_cycle_duration_seconds: int = 300

    # Minimum fraction of the initial transaction amount returned to the originator
    min_amount_retention_ratio: float = 0.70

    # Maximum scoring window for normalizing time compactness
    max_scoring_window_seconds: int = 300

    @classmethod
    def demo_preset(cls) -> CircularConfig:
        """Second-resolution preset for interactive demo fixtures."""
        return cls(
            min_cycle_length=2,
            max_cycle_length=5,
            max_hop_delay_seconds=60,
            max_cycle_duration_seconds=300,
            min_amount_retention_ratio=0.70,
            max_scoring_window_seconds=300,
        )

    @classmethod
    def aml_preset(cls) -> CircularConfig:
        """Hours/days resolution preset for AML wire/ACH transfers."""
        return cls(
            min_cycle_length=2,
            max_cycle_length=5,
            max_hop_delay_seconds=14400,       # 4 hours
            max_cycle_duration_seconds=86400,    # 24 hours
            min_amount_retention_ratio=0.70,
            max_scoring_window_seconds=86400,
        )


_SCORE_METHOD = (
    "circular_v1 = 0.4*retention_ratio + 0.3*time_compactness + 0.3*hop_score, "
    "clipped to [0, 1]. Heuristic evidence-strength ranking, not a calibrated probability."
)


def detect_circular_transfers(
    transactions: Sequence[Transaction],
    config: CircularConfig | None = None,
) -> list[Finding]:
    """Detect circular transfer loops in the given transactions.

    Strictly causal: transactions must occur in forward chronological order.
    """
    config = config or CircularConfig.demo_preset()
    txs = deduplicate_by_id(transactions)

    by_sender: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        by_sender[tx.sender].append(tx)
    for sender_txs in by_sender.values():
        sender_txs.sort(key=lambda t: (t.timestamp, t.id))

    findings_by_tx_set: dict[frozenset[str], Finding] = {}

    def find_cycles(
        originator: str,
        current_account: str,
        path: list[Transaction],
        visited_accounts: set[str],
    ) -> None:
        depth = len(path)
        if depth >= config.max_cycle_length:
            return

        last_tx = path[-1]
        next_candidates = by_sender.get(current_account, [])

        for next_tx in next_candidates:
            # Must be strictly after previous transaction
            if next_tx.timestamp <= last_tx.timestamp:
                continue

            hop_delay = (next_tx.timestamp - last_tx.timestamp).total_seconds()
            if hop_delay > config.max_hop_delay_seconds:
                continue

            total_duration = (next_tx.timestamp - path[0].timestamp).total_seconds()
            if total_duration > config.max_cycle_duration_seconds:
                continue

            # Cycle completion: next receiver is originator
            if next_tx.receiver == originator:
                cycle_len = depth + 1
                if cycle_len >= config.min_cycle_length:
                    initial_amount = path[0].amount
                    returned_amount = next_tx.amount
                    retention = (returned_amount / initial_amount) if initial_amount > 0 else 0.0

                    if retention >= config.min_amount_retention_ratio:
                        full_path = path + [next_tx]
                        tx_ids = tuple(t.id for t in full_path)
                        cycle_accounts = tuple([t.sender for t in full_path])
                        intermediaries = tuple([t.sender for t in full_path[1:]])

                        time_compactness = max(
                            0.0,
                            1.0 - min(1.0, total_duration / config.max_scoring_window_seconds),
                        )
                        retention_clamped = min(1.0, max(0.0, retention))
                        hop_score = 1.0 - (cycle_len - config.min_cycle_length) / max(
                            1, (config.max_cycle_length - config.min_cycle_length + 1)
                        )

                        score = round(
                            0.4 * retention_clamped + 0.3 * time_compactness + 0.3 * hop_score,
                            4,
                        )
                        score = min(1.0, max(0.0, score))

                        hop_delays = [
                            (full_path[i].timestamp - full_path[i - 1].timestamp).total_seconds()
                            for i in range(1, len(full_path))
                        ]

                        path_str = " -> ".join(list(cycle_accounts) + [originator])
                        explanation = (
                            f"Circular transfer detected: {path_str} completed in "
                            f"{total_duration:.1f}s across {cycle_len} hops with "
                            f"{retention:.1%} fund retention (₹{returned_amount:,} of ₹{initial_amount:,})."
                        )

                        signals = {
                            "cycle_length": cycle_len,
                            "cycle_path": list(cycle_accounts) + [originator],
                            "duration_seconds": round(total_duration, 2),
                            "initial_amount": initial_amount,
                            "returned_amount": returned_amount,
                            "retention_ratio": round(retention, 4),
                            "hop_delays_seconds": hop_delays,
                            "max_hop_delay_seconds": config.max_hop_delay_seconds,
                            "max_cycle_duration_seconds": config.max_cycle_duration_seconds,
                        }

                        finding = Finding(
                            pattern="circular_transfer",
                            involved_accounts=cycle_accounts,
                            evidence_transaction_ids=tx_ids,
                            window_start=full_path[0].timestamp,
                            window_end=full_path[-1].timestamp,
                            score=score,
                            score_method=_SCORE_METHOD,
                            rule_version="1.0.0",
                            explanation=explanation,
                            measured_signals=signals,
                            evidence=signals,
                            source_account=originator,
                            collector_account=originator,
                            intermediary_accounts=intermediaries,
                            fan_out_transaction_ids=(full_path[0].id,),
                            convergence_transaction_ids=(full_path[-1].id,),
                        )

                        tx_set_key = frozenset(tx_ids)
                        existing = findings_by_tx_set.get(tx_set_key)
                        if existing is None or finding.score > existing.score:
                            findings_by_tx_set[tx_set_key] = finding

            # Continue DFS if receiver not visited yet
            elif next_tx.receiver not in visited_accounts and next_tx.receiver != originator:
                visited_accounts.add(next_tx.receiver)
                find_cycles(originator, next_tx.receiver, path + [next_tx], visited_accounts)
                visited_accounts.remove(next_tx.receiver)

    for sender, outgoing in by_sender.items():
        for start_tx in outgoing:
            visited = {sender, start_tx.receiver}
            find_cycles(sender, start_tx.receiver, [start_tx], visited)

    return sorted(
        findings_by_tx_set.values(),
        key=lambda f: (-f.score, f.window_start, f.source_account),
    )
