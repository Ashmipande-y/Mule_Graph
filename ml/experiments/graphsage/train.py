"""Training and evaluation pipeline for isolated GraphSAGE benchmark."""

from __future__ import annotations

import math
import time
from typing import Sequence
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from ml.experiments.graphsage.model import EdgeGraphSAGEClassifier
from ml.experiments.graphsage.temporal_sampler import CausalGraphIndex


def prepare_tensors_for_split(
    transactions_df: pd.DataFrame,
    features_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    graph_index: CausalGraphIndex,
    max_neighbors: int = 5,
    seed: int = 42,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Prepare tensor batches for a given split using causal dynamic sampling."""
    rng = np.random.default_rng(seed)
    n = len(transactions_df)

    src_self_arr = np.zeros((n, 8), dtype=np.float32)
    src_neigh_arr = np.zeros((n, max_neighbors, 8), dtype=np.float32)
    dst_self_arr = np.zeros((n, 8), dtype=np.float32)
    dst_neigh_arr = np.zeros((n, max_neighbors, 8), dtype=np.float32)
    edge_feats_arr = np.zeros((n, 7), dtype=np.float32)
    y_arr = labels_df["is_laundering"].values.astype(np.float32)

    edge_cols = ["amount_log1p_inr", "is_ach", "is_wire", "hour_sin", "hour_cos", "weekday", "pair_prior_count"]
    edge_feats_subset = features_df[edge_cols].values.astype(np.float32)

    for i in range(n):
        sender = str(transactions_df.iloc[i]["sender"])
        receiver = str(transactions_df.iloc[i]["receiver"])
        ts = str(transactions_df.iloc[i]["timestamp"])

        # Causal node features
        src_self_arr[i] = graph_index.compute_causal_node_features(sender, ts)
        dst_self_arr[i] = graph_index.compute_causal_node_features(receiver, ts)

        # Causal neighbors
        src_neighs = graph_index.get_causal_neighbors(sender, ts, max_samples=max_neighbors, rng=rng)
        for j, (neigh_acc, _) in enumerate(src_neighs[:max_neighbors]):
            src_neigh_arr[i, j] = graph_index.compute_causal_node_features(neigh_acc, ts)

        dst_neighs = graph_index.get_causal_neighbors(receiver, ts, max_samples=max_neighbors, rng=rng)
        for j, (neigh_acc, _) in enumerate(dst_neighs[:max_neighbors]):
            dst_neigh_arr[i, j] = graph_index.compute_causal_node_features(neigh_acc, ts)

        edge_feats_arr[i] = edge_feats_subset[i]

    return (
        torch.from_numpy(src_self_arr),
        torch.from_numpy(src_neigh_arr),
        torch.from_numpy(dst_self_arr),
        torch.from_numpy(dst_neigh_arr),
        torch.from_numpy(edge_feats_arr),
        torch.from_numpy(y_arr),
    )


def train_graphsage(
    train_tensors: tuple,
    val_tensors: tuple,
    epochs: int = 15,
    batch_size: int = 256,
    lr: float = 0.003,
    weight_decay: float = 1e-4,
    pos_weight: float = 15.0,
    seed: int = 42,
) -> tuple[EdgeGraphSAGEClassifier, float, float]:
    """Train EdgeGraphSAGEClassifier and measure training duration."""
    torch.manual_seed(seed)
    np.random.seed(seed)

    model = EdgeGraphSAGEClassifier(node_in_dim=8, edge_in_dim=7, hidden_dim=32, out_dim=16, dropout=0.1)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([pos_weight]))

    dataset = TensorDataset(*train_tensors)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    start_time = time.perf_counter()
    model.train()
    for epoch in range(epochs):
        for b_src, b_src_n, b_dst, b_dst_n, b_edge, b_y in loader:
            optimizer.zero_grad()
            logits = model(b_src, b_src_n, b_dst, b_dst_n, b_edge)
            loss = criterion(logits, b_y)
            loss.backward()
            optimizer.step()

    train_duration = time.perf_counter() - start_time
    return model, train_duration


def evaluate_model_probabilities(
    model: EdgeGraphSAGEClassifier,
    tensors: tuple,
    batch_size: int = 512,
) -> tuple[np.ndarray, float]:
    """Run model inference on tensors and return predicted probabilities and scoring duration."""
    model.eval()
    dataset = TensorDataset(*tensors[:5])
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)

    probs_list = []
    start_time = time.perf_counter()
    with torch.no_grad():
        for b_src, b_src_n, b_dst, b_dst_n, b_edge in loader:
            p = model.predict_proba(b_src, b_src_n, b_dst, b_dst_n, b_edge)
            probs_list.append(p.numpy())

    inference_duration = time.perf_counter() - start_time
    probs = np.concatenate(probs_list, axis=0)
    return probs, inference_duration


def choose_best_f1_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Find threshold maximizing F1 on validation split."""
    candidates = np.linspace(0.01, 0.99, 99)
    best_t = 0.5
    best_f1 = -1.0
    for t in candidates:
        y_pred = (y_prob >= t).astype(int)
        f1 = f1_score(y_true, y_pred, zero_division=0)
        if f1 > best_f1 or (f1 == best_f1 and t > best_t):
            best_f1 = f1
            best_t = float(t)
    return best_t


def compute_comprehensive_metrics(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    threshold: float,
    review_budgets: Sequence[int] = (10, 20, 50, 100, 200),
) -> dict:
    """Compute standard classification metrics plus operational review budget stats."""
    y_true = np.asarray(y_true, dtype=int)
    y_prob = np.asarray(y_prob, dtype=float)
    y_pred = (y_prob >= threshold).astype(int)

    pr_auc = float(average_precision_score(y_true, y_prob))
    roc_auc = float(roc_auc_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else None
    precision = float(precision_score(y_true, y_pred, zero_division=0))
    recall = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()

    # Review budgets: sort by descending probability
    sorted_indices = np.argsort(-y_prob)
    total_pos = int(y_true.sum())

    review_stats = {}
    for k in review_budgets:
        top_k = sorted_indices[:k]
        tp_k = int(y_true[top_k].sum())
        prec_k = float(tp_k / k) if k > 0 else 0.0
        rec_k = float(tp_k / total_pos) if total_pos > 0 else 0.0
        review_stats[f"top_{k}"] = {
            "budget": k,
            "true_positives": tp_k,
            "precision": prec_k,
            "recall": rec_k,
        }

    return {
        "threshold": float(threshold),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "pr_auc": pr_auc,
        "roc_auc": roc_auc,
        "support_positive": total_pos,
        "support_negative": int((y_true == 0).sum()),
        "confusion_matrix": cm,
        "review_budget_metrics": review_stats,
    }
