"""Fan-in collector activity detector.

Pattern: Multiple distinct sender accounts transfer funds into a single collector
account within a short time window (concentration / aggregation).

Common money laundering typologies:
- Smurfing aggregation from multiple micro-mules into a primary consolidation account
- Phishing proceeds collection from multiple victims
- Fast pooling of decentralized criminal proceeds before liquidation
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass
from typing import Sequence

from .detector import Finding
from .transactions import Transaction, deduplicate_by_id


@dataclass(frozen=True)
class FanInConfig:
    """Thresholds for fan-in collector activity detection."""

    # Minimum number of distinct sender accounts required
    min_senders: int = 3

    # Sliding time window in seconds within which the incoming transfers must arrive
    fan_in_window_seconds: int = 60

    # Minimum total aggregated amount in minor units (paise/rupees)
    min_total_amount: int = 1

    # Maximum scoring window for normalizing time compactness
    max_scoring_window_seconds: int = 120

    @classmethod
    def demo_preset(cls) -> FanInConfig:
        """Second-resolution preset for interactive demo fixtures."""
        return cls(
            min_senders=3,
            fan_in_window_seconds=60,
            min_total_amount=1,
            max_scoring_window_seconds=120,
        )

    @classmethod
    def aml_preset(cls) -> FanInConfig:
        """Hours/days resolution preset for AML wire/ACH transfers."""
        return cls(
            min_senders=3,
            fan_in_window_seconds=21600,       # 6 hours
            min_total_amount=1,
            max_scoring_window_seconds=86400,   # 24 hours
        )


_SCORE_METHOD = (
    "fan_in_v1 = 0.5*sender_diversity + 0.3*time_compactness + 0.2*volume_score, "
    "clipped to [0, 1]. Heuristic evidence-strength ranking, not a calibrated probability."
)


def detect_fan_in(
    transactions: Sequence[Transaction],
    config: FanInConfig | None = None,
) -> list[Finding]:
    """Detect fan-in concentration into collector accounts."""
    config = config or FanInConfig.demo_preset()
    txs = deduplicate_by_id(transactions)

    by_receiver: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        # Transfers to oneself do not count as incoming fan-in edges
        if tx.sender != tx.receiver:
            by_receiver[tx.receiver].append(tx)

    for incoming in by_receiver.values():
        incoming.sort(key=lambda t: (t.timestamp, t.id))

    findings_by_collector: dict[str, Finding] = {}

    for collector, incoming in by_receiver.items():
        n = len(incoming)
        best_candidate: Finding | None = None

        for i in range(n):
            window_start_time = incoming[i].timestamp
            window_end_cutoff = window_start_time + datetime.timedelta(
                seconds=config.fan_in_window_seconds
            )

            window_txs: list[Transaction] = [incoming[i]]
            for j in range(i + 1, n):
                if incoming[j].timestamp > window_end_cutoff:
                    break
                window_txs.append(incoming[j])

            distinct_senders = sorted(set(t.sender for t in window_txs))
            if len(distinct_senders) < config.min_senders:
                continue

            total_amount = sum(t.amount for t in window_txs)
            if total_amount < config.min_total_amount:
                continue

            window_start = window_txs[0].timestamp
            window_end = window_txs[-1].timestamp
            window_span_seconds = max(0.0, (window_end - window_start).total_seconds())

            sender_count = len(distinct_senders)
            sender_diversity = min(
                1.0,
                (sender_count - config.min_senders + 1) / max(1, config.min_senders * 2),
            )
            time_compactness = max(
                0.0,
                1.0 - min(1.0, window_span_seconds / config.max_scoring_window_seconds),
            )
            volume_score = min(1.0, len(window_txs) / max(1, sender_count * 2))

            score = round(
                0.5 * sender_diversity + 0.3 * time_compactness + 0.2 * volume_score,
                4,
            )
            score = min(1.0, max(0.0, score))

            tx_ids = tuple(t.id for t in window_txs)
            involved = tuple(distinct_senders + [collector])

            senders_str = ", ".join(distinct_senders[:5])
            if len(distinct_senders) > 5:
                senders_str += f" and {len(distinct_senders) - 5} more"

            explanation = (
                f"Fan-in collector activity detected: {collector} aggregated funds from "
                f"{sender_count} distinct senders ({senders_str}) totaling ₹{total_amount:,} "
                f"within {window_span_seconds:.1f}s."
            )

            signals = {
                "collector_account": collector,
                "sender_count": sender_count,
                "senders": distinct_senders,
                "total_amount": total_amount,
                "transaction_count": len(window_txs),
                "window_span_seconds": round(window_span_seconds, 2),
                "fan_in_window_seconds": config.fan_in_window_seconds,
            }

            candidate = Finding(
                pattern="fan_in_collector",
                involved_accounts=involved,
                evidence_transaction_ids=tx_ids,
                window_start=window_start,
                window_end=window_end,
                score=score,
                score_method=_SCORE_METHOD,
                rule_version="1.0.0",
                explanation=explanation,
                measured_signals=signals,
                evidence=signals,
                source_account=distinct_senders[0] if distinct_senders else "",
                collector_account=collector,
                intermediary_accounts=tuple(distinct_senders),
                fan_out_transaction_ids=(),
                convergence_transaction_ids=tx_ids,
            )

            if best_candidate is None or candidate.score > best_candidate.score:
                best_candidate = candidate

        if best_candidate is not None:
            findings_by_collector[collector] = best_candidate

    return sorted(
        findings_by_collector.values(),
        key=lambda f: (-f.score, f.collector_account, f.window_start),
    )
