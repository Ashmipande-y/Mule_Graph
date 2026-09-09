"""Unusual reactivation after account dormancy detector.

Pattern: An account with no recorded transaction activity for an extended period
(dormancy) suddenly experiences an abrupt surge of high-value or high-velocity
transactions within a short burst window.

Common money laundering typologies:
- "Sleeper" mule accounts: pre-aged bank accounts purchased or rented on the dark web,
  kept quiet for months, then awakened to handle large illicit flows before freeze
- Re-activated compromised accounts after credentials leak
- Mule networks activating secondary backup accounts during ongoing operations
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass
from typing import Sequence

from .detector import Finding
from .transactions import Transaction, deduplicate_by_id


@dataclass(frozen=True)
class DormancyConfig:
    """Thresholds for unusual reactivation after dormancy."""

    # Minimum inactivity period (seconds) to qualify as dormancy
    min_dormancy_seconds: int = 3600

    # Observation window (seconds) starting from the reactivation transaction
    burst_window_seconds: int = 60

    # Minimum transaction count in the burst window
    min_burst_tx_count: int = 1

    # Minimum aggregate volume (rupees/paise) in the burst window
    min_surge_amount: int = 10000

    # Minimum multiplier vs. historical average transaction amount (if history exists)
    surge_ratio_threshold: float = 2.0

    # Maximum scoring window for normalizing dormancy duration
    max_scoring_dormancy_seconds: int = 30 * 86400

    @classmethod
    def demo_preset(cls) -> DormancyConfig:
        """Seconds/hours resolution preset for interactive tests and demo fixtures."""
        return cls(
            min_dormancy_seconds=3600,         # 1 hour
            burst_window_seconds=60,           # 60 seconds
            min_burst_tx_count=1,
            min_surge_amount=10000,
            surge_ratio_threshold=2.0,
            max_scoring_dormancy_seconds=86400,  # 24 hours
        )

    @classmethod
    def aml_preset(cls) -> DormancyConfig:
        """Days/weeks resolution preset for AML transfers."""
        return cls(
            min_dormancy_seconds=2592000,      # 30 days
            burst_window_seconds=86400,        # 24 hours
            min_burst_tx_count=1,
            min_surge_amount=50000,
            surge_ratio_threshold=2.0,
            max_scoring_dormancy_seconds=180 * 86400,  # 180 days
        )


_SCORE_METHOD = (
    "dormancy_v1 = 0.4*dormancy_depth + 0.4*volume_intensity + 0.2*count_factor, "
    "clipped to [0, 1]. Heuristic evidence-strength ranking, not a calibrated probability."
)


def detect_dormant_reactivation(
    transactions: Sequence[Transaction],
    config: DormancyConfig | None = None,
) -> list[Finding]:
    """Detect accounts exhibiting sudden transaction bursts after prolonged dormancy.

    Strictly point-in-time safe: dormancy is computed solely by looking at
    historical transactions preceding the reactivation event.
    """
    config = config or DormancyConfig.demo_preset()
    txs = deduplicate_by_id(transactions)

    # Index all transactions involving each account (either sender or receiver)
    account_activity: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        account_activity[tx.sender].append(tx)
        if tx.receiver != tx.sender:
            account_activity[tx.receiver].append(tx)

    for history in account_activity.values():
        history.sort(key=lambda t: (t.timestamp, t.id))

    findings: list[Finding] = []

    for account, history in account_activity.items():
        if len(history) < 2:
            continue

        # Look for gaps between consecutive transactions in this account's history
        for idx in range(1, len(history)):
            prev_tx = history[idx - 1]
            reactivation_tx = history[idx]

            inactivity_seconds = (reactivation_tx.timestamp - prev_tx.timestamp).total_seconds()
            if inactivity_seconds < config.min_dormancy_seconds:
                continue

            # Identify burst window starting from reactivation_tx
            burst_end_cutoff = reactivation_tx.timestamp + datetime.timedelta(
                seconds=config.burst_window_seconds
            )

            burst_txs: list[Transaction] = []
            for tx in history[idx:]:
                if tx.timestamp <= burst_end_cutoff:
                    burst_txs.append(tx)
                else:
                    break

            if len(burst_txs) < config.min_burst_tx_count:
                continue

            burst_amount = sum(t.amount for t in burst_txs)
            if burst_amount < config.min_surge_amount:
                continue

            # Calculate prior baseline
            prior_txs = history[:idx]
            prior_avg_amount = sum(t.amount for t in prior_txs) / len(prior_txs)
            surge_ratio = (burst_amount / prior_avg_amount) if prior_avg_amount > 0 else 1.0

            if prior_avg_amount > 0 and surge_ratio < config.surge_ratio_threshold:
                continue

            dormancy_depth = min(
                1.0,
                inactivity_seconds / max(1.0, float(config.max_scoring_dormancy_seconds)),
            )
            volume_intensity = min(1.0, burst_amount / max(1.0, float(config.min_surge_amount * 3)))
            count_factor = min(1.0, len(burst_txs) / max(1.0, float(config.min_burst_tx_count * 3)))

            score = round(
                0.4 * dormancy_depth + 0.4 * volume_intensity + 0.2 * count_factor,
                4,
            )
            score = min(1.0, max(0.0, score))

            window_start = reactivation_tx.timestamp
            window_end = burst_txs[-1].timestamp
            burst_span = max(0.0, (window_end - window_start).total_seconds())

            dormancy_days = inactivity_seconds / 86400.0
            dormancy_hours = inactivity_seconds / 3600.0

            if dormancy_days >= 1.0:
                dormancy_str = f"{dormancy_days:.1f} days ({dormancy_hours:.0f}h)"
            else:
                dormancy_str = f"{dormancy_hours:.1f} hours ({inactivity_seconds:.0f}s)"

            explanation = (
                f"Unusual reactivation after dormancy: Account {account} was inactive for "
                f"{dormancy_str} before a sudden surge of {len(burst_txs)} transactions "
                f"totaling ₹{burst_amount:,} within {burst_span:.1f}s."
            )

            tx_ids = tuple(t.id for t in burst_txs)
            counterparties = sorted(
                set(t.receiver if t.sender == account else t.sender for t in burst_txs)
            )
            involved = (account,) + tuple(counterparties)

            signals = {
                "account": account,
                "inactivity_seconds": round(inactivity_seconds, 1),
                "inactivity_days": round(dormancy_days, 2),
                "last_active_timestamp": prev_tx.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "reactivation_timestamp": reactivation_tx.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "burst_transaction_count": len(burst_txs),
                "burst_total_amount": burst_amount,
                "prior_average_amount": round(prior_avg_amount, 2),
                "surge_ratio": round(surge_ratio, 2),
                "burst_span_seconds": round(burst_span, 2),
            }

            finding = Finding(
                pattern="dormant_reactivation",
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
                source_account=account,
                collector_account=account,
                intermediary_accounts=tuple(counterparties),
                fan_out_transaction_ids=(prev_tx.id,),
                convergence_transaction_ids=tx_ids,
            )
            findings.append(finding)

    return sorted(
        findings,
        key=lambda f: (-f.score, f.window_start, f.source_account),
    )
