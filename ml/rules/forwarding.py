"""Rapid forwarding chain detector.

Pattern: A linear chain of directed transfers (A -> B -> C -> D ...) where each
intermediary account receives funds and rapidly forwards a large percentage onward
to the next hop within a tight time window.

Common money laundering typologies:
- Multi-hop layering / peeling chains
- Passing funds through intermediary accounts to cross institutional boundaries
- Velocity-based evasion before freeze orders or suspicious activity flags
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass
from typing import Sequence

from .detector import Finding
from .transactions import Transaction, deduplicate_by_id


@dataclass(frozen=True)
class ForwardingChainConfig:
    """Thresholds for rapid forwarding chain detection."""

    # Minimum number of hops in the chain (e.g. 3 hops = 4 distinct accounts: A->B->C->D)
    min_hops: int = 3

    # Maximum depth of hops to explore
    max_hops: int = 6

    # Maximum delay allowed between receiving funds and forwarding them onward
    max_hop_delay_seconds: int = 60

    # Maximum total duration of the chain from first transfer to last transfer
    max_chain_duration_seconds: int = 300

    # Minimum ratio of forwarded amount to received amount at each intermediary hop
    min_pass_through_ratio: float = 0.75

    # Maximum scoring window for normalizing time compactness
    max_scoring_window_seconds: int = 300

    @classmethod
    def demo_preset(cls) -> ForwardingChainConfig:
        """Second-resolution preset for interactive demo fixtures."""
        return cls(
            min_hops=3,
            max_hops=6,
            max_hop_delay_seconds=60,
            max_chain_duration_seconds=300,
            min_pass_through_ratio=0.75,
            max_scoring_window_seconds=300,
        )

    @classmethod
    def aml_preset(cls) -> ForwardingChainConfig:
        """Hours/days resolution preset for AML wire/ACH transfers."""
        return cls(
            min_hops=3,
            max_hops=6,
            max_hop_delay_seconds=14400,        # 4 hours
            max_chain_duration_seconds=86400,    # 24 hours
            min_pass_through_ratio=0.75,
            max_scoring_window_seconds=86400,
        )


_SCORE_METHOD = (
    "forwarding_chain_v1 = 0.4*pass_through_ratio + 0.3*time_compactness + 0.3*hop_score, "
    "clipped to [0, 1]. Heuristic evidence-strength ranking, not a calibrated probability."
)


def detect_forwarding_chains(
    transactions: Sequence[Transaction],
    config: ForwardingChainConfig | None = None,
) -> list[Finding]:
    """Detect rapid forwarding pass-through chains in the given transactions."""
    config = config or ForwardingChainConfig.demo_preset()
    txs = deduplicate_by_id(transactions)

    by_sender: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        by_sender[tx.sender].append(tx)
    for sender_txs in by_sender.values():
        sender_txs.sort(key=lambda t: (t.timestamp, t.id))

    found_chains: list[list[Transaction]] = []

    def explore_chain(current_path: list[Transaction], visited_accounts: set[str]) -> None:
        if len(current_path) >= config.max_hops:
            return

        last_tx = current_path[-1]
        intermediary = last_tx.receiver

        # Check outgoing candidates from intermediary
        candidates = by_sender.get(intermediary, [])
        forwarded_any = False

        for next_tx in candidates:
            # Must be chronologically after incoming transaction
            if next_tx.timestamp <= last_tx.timestamp:
                continue

            hop_delay = (next_tx.timestamp - last_tx.timestamp).total_seconds()
            if hop_delay > config.max_hop_delay_seconds:
                continue

            total_duration = (next_tx.timestamp - current_path[0].timestamp).total_seconds()
            if total_duration > config.max_chain_duration_seconds:
                continue

            # Must not create a cycle (distinct accounts in chain)
            if next_tx.receiver in visited_accounts:
                continue

            # Check pass-through conservation at this hop
            hop_ratio = (next_tx.amount / last_tx.amount) if last_tx.amount > 0 else 0.0
            if hop_ratio < config.min_pass_through_ratio:
                continue

            forwarded_any = True
            visited_accounts.add(next_tx.receiver)
            explore_chain(current_path + [next_tx], visited_accounts)
            visited_accounts.remove(next_tx.receiver)

        # If we reached minimum hops and cannot forward further, record the chain
        if not forwarded_any and len(current_path) >= config.min_hops:
            found_chains.append(current_path)

    for sender, outgoing in by_sender.items():
        for start_tx in outgoing:
            explore_chain([start_tx], {sender, start_tx.receiver})

    # Maximal sub-chain deduplication: if chain A is a sub-chain of chain B, discard A
    maximal_chains: list[list[Transaction]] = []
    for chain in found_chains:
        chain_tx_ids = set(t.id for t in chain)
        is_subchain = False
        for other in found_chains:
            if len(other) > len(chain):
                other_tx_ids = set(t.id for t in other)
                if chain_tx_ids.issubset(other_tx_ids):
                    is_subchain = True
                    break
        if not is_subchain:
            maximal_chains.append(chain)

    # Convert chains to Findings, deduplicating identical transaction sets
    findings_by_tx_set: dict[frozenset[str], Finding] = {}

    for chain in maximal_chains:
        tx_ids = tuple(t.id for t in chain)
        originator = chain[0].sender
        recipient = chain[-1].receiver
        intermediaries = tuple(t.receiver for t in chain[:-1])
        involved = (originator,) + intermediaries + (recipient,)

        initial_amount = chain[0].amount
        final_amount = chain[-1].amount
        overall_pass_through = (final_amount / initial_amount) if initial_amount > 0 else 0.0

        total_duration = (chain[-1].timestamp - chain[0].timestamp).total_seconds()
        hops = len(chain)

        time_compactness = max(
            0.0,
            1.0 - min(1.0, total_duration / config.max_scoring_window_seconds),
        )
        pass_through_clamped = min(1.0, max(0.0, overall_pass_through))
        hop_score = min(
            1.0,
            (hops - config.min_hops + 1) / max(1, (config.max_hops - config.min_hops + 1)),
        )

        score = round(
            0.4 * pass_through_clamped + 0.3 * time_compactness + 0.3 * hop_score,
            4,
        )
        score = min(1.0, max(0.0, score))

        hop_delays = [
            (chain[i].timestamp - chain[i - 1].timestamp).total_seconds()
            for i in range(1, len(chain))
        ]

        path_str = " -> ".join(involved)
        explanation = (
            f"Rapid forwarding chain detected: {path_str} across {hops} hops in "
            f"{total_duration:.1f}s with {overall_pass_through:.1%} overall pass-through "
            f"(₹{final_amount:,} of ₹{initial_amount:,})."
        )

        signals = {
            "hops": hops,
            "chain_path": list(involved),
            "duration_seconds": round(total_duration, 2),
            "initial_amount": initial_amount,
            "final_amount": final_amount,
            "pass_through_ratio": round(overall_pass_through, 4),
            "hop_delays_seconds": hop_delays,
            "max_hop_delay_seconds": config.max_hop_delay_seconds,
            "max_chain_duration_seconds": config.max_chain_duration_seconds,
        }

        finding = Finding(
            pattern="rapid_forwarding",
            involved_accounts=involved,
            evidence_transaction_ids=tx_ids,
            window_start=chain[0].timestamp,
            window_end=chain[-1].timestamp,
            score=score,
            score_method=_SCORE_METHOD,
            rule_version="1.0.0",
            explanation=explanation,
            measured_signals=signals,
            evidence=signals,
            source_account=originator,
            collector_account=recipient,
            intermediary_accounts=intermediaries,
            fan_out_transaction_ids=(chain[0].id,),
            convergence_transaction_ids=(chain[-1].id,),
        )

        tx_set_key = frozenset(tx_ids)
        existing = findings_by_tx_set.get(tx_set_key)
        if existing is None or finding.score > existing.score:
            findings_by_tx_set[tx_set_key] = finding

    return sorted(
        findings_by_tx_set.values(),
        key=lambda f: (-f.score, f.window_start, f.source_account),
    )
