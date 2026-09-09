"""Pure PyTorch CPU GraphSAGE Architecture for Transaction Classification.

Combines 2-layer GraphSAGE neighborhood aggregation on causal node representations
with an Edge Pooling MLP head to score directed transactions.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class GraphSAGELayer(nn.Module):
    """Single GraphSAGE layer with mean aggregation and layer normalization."""

    def __init__(self, in_features: int, out_features: int, dropout: float = 0.1):
        super().__init__()
        self.linear_self = nn.Linear(in_features, out_features, bias=True)
        self.linear_neigh = nn.Linear(in_features, out_features, bias=False)
        self.layer_norm = nn.LayerNorm(out_features)
        self.dropout = nn.Dropout(dropout)

    def forward(self, self_feats: torch.Tensor, neigh_feats: torch.Tensor) -> torch.Tensor:
        """
        self_feats: [batch_size, in_features]
        neigh_feats: [batch_size, num_neighbors, in_features] or [batch_size, in_features]
        """
        if neigh_feats.dim() == 3:
            # Mean aggregation over neighbor dimension
            neigh_agg = neigh_feats.mean(dim=1)
        else:
            neigh_agg = neigh_feats

        h = self.linear_self(self_feats) + self.linear_neigh(neigh_agg)
        h = F.relu(h)
        h = self.layer_norm(h)
        h = self.dropout(h)
        return h


class EdgeGraphSAGEClassifier(nn.Module):
    """End-to-end GraphSAGE model for edge classification."""

    def __init__(
        self,
        node_in_dim: int = 8,
        edge_in_dim: int = 7,
        hidden_dim: int = 32,
        out_dim: int = 16,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.sage1 = GraphSAGELayer(node_in_dim, hidden_dim, dropout=dropout)
        self.sage2 = GraphSAGELayer(hidden_dim, out_dim, dropout=dropout)

        # Edge classification head: combines source node, target node, and edge features
        combined_dim = (out_dim * 2) + edge_in_dim
        self.edge_mlp = nn.Sequential(
            nn.Linear(combined_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
        )

    def forward(
        self,
        src_self: torch.Tensor,
        src_neigh1: torch.Tensor,
        dst_self: torch.Tensor,
        dst_neigh1: torch.Tensor,
        edge_feats: torch.Tensor,
    ) -> torch.Tensor:
        """
        src_self: [batch, node_in_dim]
        src_neigh1: [batch, num_neighbors, node_in_dim]
        dst_self: [batch, node_in_dim]
        dst_neigh1: [batch, num_neighbors, node_in_dim]
        edge_feats: [batch, edge_in_dim]
        Returns: logits [batch, 1]
        """
        h_src = self.sage1(src_self, src_neigh1)
        h_dst = self.sage1(dst_self, dst_neigh1)

        # For layer 2, aggregate residual representation
        h_src2 = self.sage2(h_src, h_src)
        h_dst2 = self.sage2(h_dst, h_dst)

        combined = torch.cat([h_src2, h_dst2, edge_feats], dim=-1)
        logits = self.edge_mlp(combined)
        return logits.squeeze(-1)

    def predict_proba(
        self,
        src_self: torch.Tensor,
        src_neigh1: torch.Tensor,
        dst_self: torch.Tensor,
        dst_neigh1: torch.Tensor,
        edge_feats: torch.Tensor,
    ) -> torch.Tensor:
        with torch.no_grad():
            logits = self.forward(src_self, src_neigh1, dst_self, dst_neigh1, edge_feats)
            return torch.sigmoid(logits)
