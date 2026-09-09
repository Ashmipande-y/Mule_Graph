"""Transaction -> graph conversion for `GET /api/graph`.

Reads and validates the transaction source file on every call (per the
README: "Read and validate the transaction file for each static graph
request in this small demo"). This is a general-purpose converter — it
accepts any valid non-canonical or empty transaction set, unlike
scripts/validate_demo.py, which intentionally only accepts the exact
seven-transaction canonical fixture.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any

from app.adapters.ml_rules import MlRulesError, evaluate_transactions
from app.schemas import Edge, GraphFinding, GraphResponse, Node

TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

CANONICAL_LABELS = {
    "ACC_VICTIM": "Victim",
    "ACC_A": "Account A",
    "ACC_B": "Account B",
    "ACC_C": "Account C",
    "ACC_D": "Account D",
    "ACC_X": "Collector X",
}


class GraphSourceError(Exception):
    """Raised when the transaction source file is missing or malformed.

    Maps to HTTP 500 per docs/api-contract.md: a bad source file is a
    server-side data problem, not a client request error.
    """


def _is_positive_int_amount(value: Any) -> bool:
    # bool is a subclass of int in Python; reject it explicitly.
    if isinstance(value, bool):
        return False
    if not isinstance(value, int):
        return False
    return value > 0


def _parse_timestamp(value: Any, where: str) -> datetime.datetime:
    if not isinstance(value, str):
        raise GraphSourceError(f"{where}: timestamp must be a string, got {type(value).__name__}")
    try:
        return datetime.datetime.strptime(value, TIMESTAMP_FORMAT)
    except ValueError as exc:
        raise GraphSourceError(
            f"{where}: timestamp {value!r} is not a valid UTC 'YYYY-MM-DDTHH:MM:SSZ' value"
        ) from exc


def _require_fields(record: Any, fields: list[str], where: str) -> None:
    if not isinstance(record, dict):
        raise GraphSourceError(f"{where}: expected an object, got {type(record).__name__}")
    for name in fields:
        if name not in record:
            raise GraphSourceError(f"{where}: missing required field '{name}'")


def _load_json(path: Path) -> Any:
    if not path.exists():
        raise GraphSourceError(f"transaction source file not found: {path}")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise GraphSourceError(f"transaction source file could not be read: {path} ({exc})") from exc
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise GraphSourceError(
            f"transaction source file is not valid JSON: {path} (line {exc.lineno}, col {exc.colno}: {exc.msg})"
        ) from exc


def validate_transactions(data: Any) -> list[dict]:
    """Validates a raw list of transaction records against the canonical
    demo's schema (id/sender/receiver non-empty strings, positive-integer
    `amount` with no boolean coercion, full UTC ISO 8601 second-precision
    `timestamp`, no duplicate ids). Public: also used by
    `app.api.assess` for `POST /api/assess`, which evaluates a
    caller-supplied transaction set the same way this validates the
    canonical fixture for `GET /api/graph`."""
    if not isinstance(data, list):
        raise GraphSourceError(f"transaction source: top-level value must be a JSON array, got {type(data).__name__}")

    seen_ids: set[str] = set()
    validated: list[dict] = []

    for index, record in enumerate(data):
        where = f"transactions[{index}]"
        _require_fields(record, ["id", "sender", "receiver", "amount", "timestamp"], where)

        tx_id = record["id"]
        if not isinstance(tx_id, str) or not tx_id:
            raise GraphSourceError(f"{where}: 'id' must be a nonempty string, got {tx_id!r}")
        where = f"transaction '{tx_id}'"
        if tx_id in seen_ids:
            raise GraphSourceError(f"{where}: duplicate transaction id")
        seen_ids.add(tx_id)

        sender = record["sender"]
        if not isinstance(sender, str) or not sender:
            raise GraphSourceError(f"{where}: 'sender' must be a nonempty string, got {sender!r}")

        receiver = record["receiver"]
        if not isinstance(receiver, str) or not receiver:
            raise GraphSourceError(f"{where}: 'receiver' must be a nonempty string, got {receiver!r}")

        amount = record["amount"]
        if not _is_positive_int_amount(amount):
            raise GraphSourceError(f"{where}: 'amount' must be a positive integer (not a boolean), got {amount!r}")

        _parse_timestamp(record["timestamp"], where)

        validated.append(
            {
                "id": tx_id,
                "sender": sender,
                "receiver": receiver,
                "amount": amount,
                "timestamp": record["timestamp"],
            }
        )

    return validated


def _label_for(account_id: str) -> str:
    return CANONICAL_LABELS.get(account_id, account_id)


def _build_graph(transactions: list[dict]) -> GraphResponse:
    account_ids: set[str] = set()
    for tx in transactions:
        account_ids.add(tx["sender"])
        account_ids.add(tx["receiver"])

    try:
        _, findings, account_risk = evaluate_transactions(transactions)
    except MlRulesError as exc:
        raise GraphSourceError(f"rules adapter rejected an already-validated record: {exc}") from exc

    nodes = []
    for account_id in sorted(account_ids):
        risk = account_risk.get(account_id)
        if risk is None:
            # Absent from every finding is "not assessed", not "proven safe"
            # (backend/README.md Stage 2: "Accounts absent from a finding
            # must not be declared proven safe").
            nodes.append(Node(id=account_id, label=_label_for(account_id), risk_score=None, risk_level="UNASSESSED"))
        else:
            nodes.append(
                Node(
                    id=account_id,
                    label=_label_for(account_id),
                    risk_score=risk.max_score,
                    risk_level=risk.risk_level,
                )
            )

    edges = [
        Edge(
            id=tx["id"],
            source=tx["sender"],
            target=tx["receiver"],
            amount=tx["amount"],
            timestamp=tx["timestamp"],
        )
        for tx in transactions
    ]
    edges.sort(key=lambda edge: (edge.timestamp, edge.id))

    finding_models = [
        GraphFinding(
            pattern=f.pattern,
            source_account=f.source_account,
            collector_account=f.collector_account,
            intermediary_accounts=list(f.intermediary_accounts),
            fan_out_transaction_ids=list(f.fan_out_transaction_ids),
            convergence_transaction_ids=list(f.convergence_transaction_ids),
            window_start=f.window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            window_end=f.window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            score=f.score,
            score_method=f.score_method,
            evidence=f.evidence,
        )
        for f in findings
    ]

    return GraphResponse(nodes=nodes, edges=edges, findings=finding_models)


def load_graph(path: Path) -> GraphResponse:
    """Read, validate, and convert the transaction source file into a graph.

    Raises GraphSourceError on any missing/malformed source data.
    """
    data = _load_json(path)
    transactions = validate_transactions(data)
    return _build_graph(transactions)
