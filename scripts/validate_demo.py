#!/usr/bin/env python3
"""Validate the MuleGraph canonical demo fixtures.

Checks data/demo_transactions.json (the seven-transfer canonical scenario)
and data/graph.example.json (its graph-contract representation) for
structural correctness and exact agreement with each other.

This is a fixture validator, not a general-purpose schema validator: it
checks that the two files encode *this specific* seven-transaction,
six-account demo scenario. It intentionally rejects any other dataset,
including a valid empty one, because its job is to catch drift in the
one fixture the frontend and backend both depend on for local development.

Usage (from repository root or anywhere):
    python scripts/validate_demo.py
    python scripts/validate_demo.py --transactions path/to/tx.json --graph path/to/graph.json

Exit code 0 on success, non-zero on the first validation failure.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_TRANSACTIONS_PATH = REPO_ROOT / "data" / "demo_transactions.json"
DEFAULT_GRAPH_PATH = REPO_ROOT / "data" / "graph.example.json"

TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

CANONICAL_LABELS = {
    "ACC_VICTIM": "Victim",
    "ACC_A": "Account A",
    "ACC_B": "Account B",
    "ACC_C": "Account C",
    "ACC_D": "Account D",
    "ACC_X": "Collector X",
}

CANONICAL_TRANSACTIONS = {
    "TX_001": {"sender": "ACC_VICTIM", "receiver": "ACC_A", "amount": 50000, "timestamp": "2026-01-01T10:00:00Z"},
    "TX_002": {"sender": "ACC_A", "receiver": "ACC_B", "amount": 15000, "timestamp": "2026-01-01T10:00:04Z"},
    "TX_003": {"sender": "ACC_A", "receiver": "ACC_C", "amount": 14000, "timestamp": "2026-01-01T10:00:07Z"},
    "TX_004": {"sender": "ACC_A", "receiver": "ACC_D", "amount": 16000, "timestamp": "2026-01-01T10:00:10Z"},
    "TX_005": {"sender": "ACC_B", "receiver": "ACC_X", "amount": 13000, "timestamp": "2026-01-01T10:00:15Z"},
    "TX_006": {"sender": "ACC_C", "receiver": "ACC_X", "amount": 12000, "timestamp": "2026-01-01T10:00:18Z"},
    "TX_007": {"sender": "ACC_D", "receiver": "ACC_X", "amount": 14000, "timestamp": "2026-01-01T10:00:21Z"},
}

CANONICAL_ACCOUNT_IDS = set(CANONICAL_LABELS)


class ValidationError(Exception):
    """Raised with a message identifying the offending record/field."""


def load_json(path: Path, kind: str) -> Any:
    if not path.exists():
        raise ValidationError(f"{kind} file not found: {path}")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValidationError(f"{kind} file could not be read: {path} ({exc})") from exc
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"{kind} file is not valid JSON: {path} (line {exc.lineno}, col {exc.colno}: {exc.msg})") from exc


def is_positive_int_amount(value: Any) -> bool:
    # bool is a subclass of int in Python; explicitly reject it.
    if isinstance(value, bool):
        return False
    if not isinstance(value, int):
        return False
    return value > 0


def parse_timestamp(value: Any, where: str) -> datetime.datetime:
    if not isinstance(value, str):
        raise ValidationError(f"{where}: timestamp must be a string, got {type(value).__name__}")
    try:
        return datetime.datetime.strptime(value, TIMESTAMP_FORMAT)
    except ValueError as exc:
        raise ValidationError(f"{where}: timestamp {value!r} is not a valid UTC 'YYYY-MM-DDTHH:MM:SSZ' value ({exc})") from exc


def require_fields(record: Any, fields: list[str], where: str) -> None:
    if not isinstance(record, dict):
        raise ValidationError(f"{where}: expected an object, got {type(record).__name__}")
    for field in fields:
        if field not in record:
            raise ValidationError(f"{where}: missing required field '{field}'")


def validate_transactions(data: Any) -> dict[str, dict]:
    if not isinstance(data, list):
        raise ValidationError(f"transactions file: top-level value must be a JSON array, got {type(data).__name__}")

    seen_ids: set[str] = set()
    by_id: dict[str, dict] = {}

    for index, record in enumerate(data):
        where = f"transactions[{index}]"
        require_fields(record, ["id", "sender", "receiver", "amount", "timestamp"], where)

        tx_id = record["id"]
        if not isinstance(tx_id, str) or not tx_id:
            raise ValidationError(f"{where}: 'id' must be a nonempty string, got {tx_id!r}")
        where = f"transaction '{tx_id}'"
        if tx_id in seen_ids:
            raise ValidationError(f"{where}: duplicate transaction id")
        seen_ids.add(tx_id)

        sender = record["sender"]
        if not isinstance(sender, str) or not sender:
            raise ValidationError(f"{where}: 'sender' must be a nonempty string, got {sender!r}")

        receiver = record["receiver"]
        if not isinstance(receiver, str) or not receiver:
            raise ValidationError(f"{where}: 'receiver' must be a nonempty string, got {receiver!r}")

        amount = record["amount"]
        if not is_positive_int_amount(amount):
            raise ValidationError(f"{where}: 'amount' must be a positive integer (not a boolean), got {amount!r}")

        parse_timestamp(record["timestamp"], where)

        by_id[tx_id] = record

    # Canonical scenario check: exactly the seven expected transfers, no more, no fewer.
    actual_ids = set(by_id)
    missing = sorted(CANONICAL_TRANSACTIONS.keys() - actual_ids)
    extra = sorted(actual_ids - CANONICAL_TRANSACTIONS.keys())
    if missing:
        raise ValidationError(f"transactions file: missing canonical transaction(s): {', '.join(missing)}")
    if extra:
        raise ValidationError(f"transactions file: unexpected non-canonical transaction(s): {', '.join(extra)}")

    for tx_id, expected in CANONICAL_TRANSACTIONS.items():
        actual = by_id[tx_id]
        for field, expected_value in expected.items():
            actual_value = actual[field]
            if actual_value != expected_value:
                raise ValidationError(
                    f"transaction '{tx_id}': field '{field}' expected {expected_value!r}, got {actual_value!r}"
                )

    actual_accounts = set()
    for record in by_id.values():
        actual_accounts.add(record["sender"])
        actual_accounts.add(record["receiver"])
    missing_accounts = sorted(CANONICAL_ACCOUNT_IDS - actual_accounts)
    extra_accounts = sorted(actual_accounts - CANONICAL_ACCOUNT_IDS)
    if missing_accounts:
        raise ValidationError(f"transactions file: missing canonical account(s): {', '.join(missing_accounts)}")
    if extra_accounts:
        raise ValidationError(f"transactions file: unexpected non-canonical account(s): {', '.join(extra_accounts)}")

    return by_id


def validate_graph(data: Any) -> tuple[dict[str, dict], dict[str, dict]]:
    if not isinstance(data, dict):
        raise ValidationError(f"graph file: top-level value must be a JSON object, got {type(data).__name__}")
    require_fields(data, ["nodes", "edges"], "graph file")

    nodes = data["nodes"]
    edges = data["edges"]
    if not isinstance(nodes, list):
        raise ValidationError(f"graph file: 'nodes' must be a JSON array, got {type(nodes).__name__}")
    if not isinstance(edges, list):
        raise ValidationError(f"graph file: 'edges' must be a JSON array, got {type(edges).__name__}")

    # --- nodes ---
    seen_node_ids: set[str] = set()
    nodes_by_id: dict[str, dict] = {}
    for index, node in enumerate(nodes):
        where = f"graph nodes[{index}]"
        require_fields(node, ["id", "label", "risk_score", "risk_level"], where)

        node_id = node["id"]
        if not isinstance(node_id, str) or not node_id:
            raise ValidationError(f"{where}: 'id' must be a nonempty string, got {node_id!r}")
        where = f"graph node '{node_id}'"
        if node_id in seen_node_ids:
            raise ValidationError(f"{where}: duplicate node id")
        seen_node_ids.add(node_id)

        if node_id not in CANONICAL_LABELS:
            raise ValidationError(f"{where}: unexpected non-canonical node id")

        expected_label = CANONICAL_LABELS[node_id]
        if node["label"] != expected_label:
            raise ValidationError(f"{where}: 'label' expected {expected_label!r}, got {node['label']!r}")

        if node["risk_score"] is not None:
            raise ValidationError(f"{where}: 'risk_score' must be null in Stage 0, got {node['risk_score']!r}")

        if node["risk_level"] != "UNASSESSED":
            raise ValidationError(f"{where}: 'risk_level' must be 'UNASSESSED' in Stage 0, got {node['risk_level']!r}")

        nodes_by_id[node_id] = node

    missing_nodes = sorted(CANONICAL_ACCOUNT_IDS - seen_node_ids)
    if missing_nodes:
        raise ValidationError(f"graph file: missing canonical node(s): {', '.join(missing_nodes)}")

    node_ids_in_order = [n["id"] for n in nodes]
    if node_ids_in_order != sorted(node_ids_in_order):
        raise ValidationError("graph file: 'nodes' must be sorted by 'id'")

    # --- edges ---
    seen_edge_ids: set[str] = set()
    edges_by_id: dict[str, dict] = {}
    for index, edge in enumerate(edges):
        where = f"graph edges[{index}]"
        require_fields(edge, ["id", "source", "target", "amount", "timestamp"], where)

        edge_id = edge["id"]
        if not isinstance(edge_id, str) or not edge_id:
            raise ValidationError(f"{where}: 'id' must be a nonempty string, got {edge_id!r}")
        where = f"graph edge '{edge_id}'"
        if edge_id in seen_edge_ids:
            raise ValidationError(f"{where}: duplicate edge id")
        seen_edge_ids.add(edge_id)

        source = edge["source"]
        target = edge["target"]
        if source not in nodes_by_id:
            raise ValidationError(f"{where}: 'source' {source!r} does not reference a known node (dangling edge)")
        if target not in nodes_by_id:
            raise ValidationError(f"{where}: 'target' {target!r} does not reference a known node (dangling edge)")

        if not is_positive_int_amount(edge["amount"]):
            raise ValidationError(f"{where}: 'amount' must be a positive integer (not a boolean), got {edge['amount']!r}")

        parse_timestamp(edge["timestamp"], where)

        edges_by_id[edge_id] = edge

    edge_sort_keys = [(e["timestamp"], e["id"]) for e in edges]
    if edge_sort_keys != sorted(edge_sort_keys):
        raise ValidationError("graph file: 'edges' must be sorted by (timestamp, id)")

    return nodes_by_id, edges_by_id


def cross_check(transactions_by_id: dict[str, dict], edges_by_id: dict[str, dict]) -> None:
    missing_edges = sorted(set(transactions_by_id) - set(edges_by_id))
    extra_edges = sorted(set(edges_by_id) - set(transactions_by_id))
    if missing_edges:
        raise ValidationError(f"graph file: missing edge(s) for transaction(s): {', '.join(missing_edges)}")
    if extra_edges:
        raise ValidationError(f"graph file: edge(s) with no matching transaction: {', '.join(extra_edges)}")

    for tx_id, tx in transactions_by_id.items():
        edge = edges_by_id[tx_id]
        if edge["source"] != tx["sender"]:
            raise ValidationError(
                f"transaction '{tx_id}': graph edge 'source' {edge['source']!r} does not match transaction 'sender' {tx['sender']!r}"
            )
        if edge["target"] != tx["receiver"]:
            raise ValidationError(
                f"transaction '{tx_id}': graph edge 'target' {edge['target']!r} does not match transaction 'receiver' {tx['receiver']!r}"
            )
        if edge["amount"] != tx["amount"]:
            raise ValidationError(
                f"transaction '{tx_id}': graph edge 'amount' {edge['amount']!r} does not match transaction 'amount' {tx['amount']!r}"
            )
        if edge["timestamp"] != tx["timestamp"]:
            raise ValidationError(
                f"transaction '{tx_id}': graph edge 'timestamp' {edge['timestamp']!r} does not match transaction 'timestamp' {tx['timestamp']!r}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate the MuleGraph canonical demo fixtures.")
    parser.add_argument("--transactions", type=Path, default=DEFAULT_TRANSACTIONS_PATH, help="Path to demo_transactions.json")
    parser.add_argument("--graph", type=Path, default=DEFAULT_GRAPH_PATH, help="Path to graph.example.json")
    args = parser.parse_args(argv)

    try:
        transactions_data = load_json(args.transactions, "transactions")
        graph_data = load_json(args.graph, "graph")

        transactions_by_id = validate_transactions(transactions_data)
        nodes_by_id, edges_by_id = validate_graph(graph_data)
        cross_check(transactions_by_id, edges_by_id)
    except ValidationError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    print(
        "OK: canonical demo fixtures valid "
        f"({len(nodes_by_id)} accounts, {len(transactions_by_id)} transactions, {len(edges_by_id)} edges)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
