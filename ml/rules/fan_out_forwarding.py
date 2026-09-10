"""Fan-out followed by rapid forwarding through one funded recipient."""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass
from typing import Sequence

from .detector import Finding
from .transactions import Transaction, deduplicate_by_id


@dataclass(frozen=True)
class FanOutForwardingConfig:
    min_recipients: int = 3
    fan_out_window_seconds: int = 300
    max_forward_delay_seconds: int = 300
    min_pass_through_ratio: float = 0.9
    max_pass_through_ratio: float = 1.05


_SCORE_METHOD = (
    "fan_out_forwarding_v1 = 0.3*fan_out_breadth + 0.4*amount_retention + "
    "0.3*forwarding_velocity, clipped to [0, 1]. Heuristic evidence-strength "
    "ranking, not a calibrated probability."
)


def detect_fan_out_forwarding(
    transactions: Sequence[Transaction],
    config: FanOutForwardingConfig | None = None,
) -> list[Finding]:
    """Detect a compact fan-out where a funded recipient rapidly passes funds onward."""
    config = config or FanOutForwardingConfig()
    txs = deduplicate_by_id(transactions)
    by_sender: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        by_sender[tx.sender].append(tx)
    for outgoing in by_sender.values():
        outgoing.sort(key=lambda tx: (tx.timestamp, tx.id))

    findings: dict[tuple[str, str, str], Finding] = {}
    for source, outgoing in by_sender.items():
        for start_index, start in enumerate(outgoing):
            cutoff = start.timestamp + datetime.timedelta(seconds=config.fan_out_window_seconds)
            window = [tx for tx in outgoing[start_index:] if tx.timestamp <= cutoff and tx.receiver != source]
            funded: dict[str, Transaction] = {}
            for tx in window:
                funded[tx.receiver] = tx
            if len(funded) < config.min_recipients:
                continue

            fan_out_txs = sorted(funded.values(), key=lambda tx: (tx.timestamp, tx.id))
            for intermediary, incoming in funded.items():
                forward_cutoff = incoming.timestamp + datetime.timedelta(seconds=config.max_forward_delay_seconds)
                for forwarded in by_sender.get(intermediary, []):
                    if not incoming.timestamp < forwarded.timestamp <= forward_cutoff:
                        continue
                    if forwarded.receiver == source or forwarded.receiver in funded:
                        continue
                    retention = forwarded.amount / incoming.amount
                    if not config.min_pass_through_ratio <= retention <= config.max_pass_through_ratio:
                        continue

                    delay = (forwarded.timestamp - incoming.timestamp).total_seconds()
                    breadth = min(1.0, len(funded) / config.min_recipients)
                    amount_retention = min(1.0, retention)
                    velocity = max(0.0, 1.0 - delay / config.max_forward_delay_seconds)
                    score = round(min(1.0, 0.3 * breadth + 0.4 * amount_retention + 0.3 * velocity), 4)
                    evidence_ids = tuple(tx.id for tx in fan_out_txs) + (forwarded.id,)
                    signals = {
                        "fan_out_recipient_count": len(funded),
                        "fan_out_window_seconds": config.fan_out_window_seconds,
                        "forwarding_delay_seconds": delay,
                        "max_forward_delay_seconds": config.max_forward_delay_seconds,
                        "incoming_amount": incoming.amount,
                        "forwarded_amount": forwarded.amount,
                        "pass_through_ratio": round(retention, 4),
                        "forwarding_account": intermediary,
                    }
                    candidate = Finding(
                        pattern="fan_out_rapid_forwarding",
                        involved_accounts=(source, *sorted(funded), forwarded.receiver),
                        evidence_transaction_ids=evidence_ids,
                        window_start=fan_out_txs[0].timestamp,
                        window_end=max(fan_out_txs[-1].timestamp, forwarded.timestamp),
                        score=score,
                        score_method=_SCORE_METHOD,
                        rule_version="1.0.0",
                        explanation=(
                            f"{source} funded {len(funded)} distinct accounts within "
                            f"{config.fan_out_window_seconds / 60:.0f} minutes; {intermediary} then "
                            f"forwarded {retention:.1%} of its received amount to {forwarded.receiver} "
                            f"after {delay:.0f} seconds."
                        ),
                        measured_signals=signals,
                        source_account=source,
                        collector_account=forwarded.receiver,
                        intermediary_accounts=(intermediary,),
                        fan_out_transaction_ids=tuple(tx.id for tx in fan_out_txs),
                        convergence_transaction_ids=(forwarded.id,),
                    )
                    key = (source, intermediary, forwarded.receiver)
                    existing = findings.get(key)
                    if existing is None or candidate.score > existing.score:
                        findings[key] = candidate

    return sorted(findings.values(), key=lambda finding: (-finding.score, finding.window_start))
