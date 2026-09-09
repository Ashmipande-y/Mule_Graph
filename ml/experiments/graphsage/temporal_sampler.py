"""Causal temporal neighborhood sampler for GraphSAGE on AML transfers.

Strict Invariants:
1. Pure Causal Past: For any target transaction at timestamp `t`, ONLY transactions
   strictly earlier (`t_prev < t`) are visible in the graph.
2. Same-Minute Exclusion: Transactions at `t_prev == t` are excluded to prevent
   intra-batch and sibling transaction leakage.
3. Zero Label Leakage: Labels (`is_laundering`) are NEVER included in graph edges,
   node features, or neighborhood states.
4. Deterministic and reproducible: Seeded sampling when neighbor sets exceed sample size.
"""

from __future__ import annotations

from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
import math
import numpy as np


@dataclass(frozen=True)
class HistoricalEdge:
    timestamp_str: str
    timestamp_epoch: float
    sender: str
    receiver: str
    amount_log1p: float
    is_ach: float
    is_wire: float


class CausalGraphIndex:
    """Maintains a chronological index of transfers for efficient causal neighborhood queries."""

    def __init__(self, transactions: list[dict]):
        """Build index from chronological transaction list."""
        self.edges: list[HistoricalEdge] = []
        self.node_adj: dict[str, list[int]] = defaultdict(list)
        self.node_timestamps: dict[str, list[str]] = defaultdict(list)
        self.account_ids: set[str] = set()

        for idx, tx in enumerate(transactions):
            ts = tx["timestamp"]
            sender = str(tx["sender"])
            receiver = str(tx["receiver"])
            fmt = str(tx.get("payment_format", "ACH")).upper()
            amt = float(tx.get("amount_paise", 0)) / 100.0
            amt_log1p = math.log1p(amt)
            is_ach = 1.0 if fmt == "ACH" else 0.0
            is_wire = 1.0 if fmt == "WIRE" else 0.0

            edge = HistoricalEdge(
                timestamp_str=ts,
                timestamp_epoch=idx,  # Monotonic integer for chronological ordering
                sender=sender,
                receiver=receiver,
                amount_log1p=amt_log1p,
                is_ach=is_ach,
                is_wire=is_wire,
            )
            self.edges.append(edge)
            self.node_adj[sender].append(idx)
            self.node_adj[receiver].append(idx)
            self.node_timestamps[sender].append(ts)
            self.node_timestamps[receiver].append(ts)
            self.account_ids.add(sender)
            self.account_ids.add(receiver)

    def get_causal_neighbors(
        self, account: str, before_timestamp: str, max_samples: int = 10, rng: np.random.Generator | None = None
    ) -> list[tuple[str, HistoricalEdge]]:
        """Retrieve up to max_samples causal neighbors connected strictly before before_timestamp."""
        if account not in self.node_adj:
            return []

        ts_list = self.node_timestamps[account]
        idx_bound = bisect_left(ts_list, before_timestamp)
        if idx_bound == 0:
            return []

        causal_edge_indices = self.node_adj[account][:idx_bound]
        if not causal_edge_indices:
            return []

        if len(causal_edge_indices) > max_samples:
            if rng is not None:
                chosen_indices = rng.choice(causal_edge_indices, size=max_samples, replace=False)
            else:
                chosen_indices = causal_edge_indices[-max_samples:]
        else:
            chosen_indices = causal_edge_indices

        neighbors: list[tuple[str, HistoricalEdge]] = []
        for e_idx in chosen_indices:
            edge = self.edges[e_idx]
            other = edge.receiver if edge.sender == account else edge.sender
            neighbors.append((other, edge))

        return neighbors

    def compute_causal_node_features(self, account: str, before_timestamp: str) -> np.ndarray:
        """Compute an 8-dimensional structural base feature vector for a node strictly before timestamp.
        
        Features:
        0: log1p(out_count)
        1: log1p(in_count)
        2: log1p(out_amount)
        3: log1p(in_amount)
        4: out_ratio (out_count / total_count)
        5: distinct_counterparties_count (log1p)
        6: has_prior_activity (0.0 or 1.0)
        7: recent_activity_flag (active in last 5 transfers)
        """
        feats = np.zeros(8, dtype=np.float32)
        if account not in self.node_adj:
            return feats

        ts_list = self.node_timestamps[account]
        idx_bound = bisect_left(ts_list, before_timestamp)
        if idx_bound == 0:
            return feats

        causal_edge_indices = self.node_adj[account][:idx_bound]
        if not causal_edge_indices:
            return feats

        out_count = 0
        in_count = 0
        out_amt = 0.0
        in_amt = 0.0
        counterparties = set()

        for e_idx in causal_edge_indices:
            edge = self.edges[e_idx]
            amt = math.expm1(edge.amount_log1p)
            if edge.sender == account:
                out_count += 1
                out_amt += amt
                counterparties.add(edge.receiver)
            else:
                in_count += 1
                in_amt += amt
                counterparties.add(edge.sender)

        total_count = out_count + in_count
        feats[0] = math.log1p(out_count)
        feats[1] = math.log1p(in_count)
        feats[2] = math.log1p(out_amt)
        feats[3] = math.log1p(in_amt)
        feats[4] = float(out_count / total_count) if total_count > 0 else 0.0
        feats[5] = math.log1p(len(counterparties))
        feats[6] = 1.0
        feats[7] = 1.0 if len(causal_edge_indices) >= 3 else 0.5
        return feats
