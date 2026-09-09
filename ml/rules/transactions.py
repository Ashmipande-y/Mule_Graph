"""Loading and parsing of transaction records.

Deliberately minimal: this is not a re-implementation of
scripts/validate_demo.py's full fixture validation. It parses the same JSON
transaction shape (id, sender, receiver, amount, timestamp) into a typed,
immutable Transaction so the rules/replay code has something concrete to
operate on.
"""

from __future__ import annotations

import datetime
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


class TransactionParseError(Exception):
    """Raised when a raw record cannot be parsed into a Transaction."""


@dataclass(frozen=True, order=True)
class Transaction:
    timestamp: datetime.datetime
    id: str
    sender: str
    receiver: str
    amount: int

    @staticmethod
    def from_dict(record: dict[str, Any]) -> "Transaction":
        try:
            tx_id = record["id"]
            sender = record["sender"]
            receiver = record["receiver"]
            amount = record["amount"]
            timestamp_raw = record["timestamp"]
        except KeyError as exc:
            raise TransactionParseError(f"transaction record missing field: {exc}") from exc

        if not isinstance(tx_id, str) or not tx_id:
            raise TransactionParseError(f"transaction 'id' must be a nonempty string, got {tx_id!r}")
        if not isinstance(sender, str) or not sender:
            raise TransactionParseError(f"transaction '{tx_id}': 'sender' must be a nonempty string, got {sender!r}")
        if not isinstance(receiver, str) or not receiver:
            raise TransactionParseError(f"transaction '{tx_id}': 'receiver' must be a nonempty string, got {receiver!r}")
        if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
            raise TransactionParseError(f"transaction '{tx_id}': 'amount' must be a positive integer (not a boolean), got {amount!r}")
        if not isinstance(timestamp_raw, str):
            raise TransactionParseError(f"transaction '{tx_id}': 'timestamp' must be a string, got {timestamp_raw!r}")
        try:
            timestamp = datetime.datetime.strptime(timestamp_raw, TIMESTAMP_FORMAT).replace(tzinfo=datetime.timezone.utc)
        except ValueError as exc:
            raise TransactionParseError(f"transaction '{tx_id}': invalid UTC timestamp {timestamp_raw!r} ({exc})") from exc

        return Transaction(timestamp=timestamp, id=tx_id, sender=sender, receiver=receiver, amount=amount)


def load_transactions(path: Path) -> list[Transaction]:
    """Load and parse a transactions JSON file, sorted by (timestamp, id).

    Duplicate transaction ids (the exact same id appearing more than once) are
    collapsed to a single record, keeping the first occurrence. This matches
    the eventual replay assumption that a transaction id is a stable identity
    for one real transfer; a repeated record is an ingestion artifact, not a
    second transfer, so it must not be able to inflate evidence downstream.
    """
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise TransactionParseError(f"{path}: top-level value must be a JSON array")

    by_id: dict[str, Transaction] = {}
    for index, record in enumerate(raw):
        try:
            tx = Transaction.from_dict(record)
        except TransactionParseError as exc:
            raise TransactionParseError(f"{path}[{index}]: {exc}") from exc
        by_id.setdefault(tx.id, tx)

    return sorted(by_id.values())


def deduplicate_by_id(transactions: Sequence[Transaction]) -> list[Transaction]:
    """Collapse duplicate transaction ids, keeping the first occurrence.

    Used defensively inside the detector as well as at load time, so that
    callers who build a Transaction list some other way (tests, a future
    replay feed) still get the same duplicate-safety guarantee.
    """
    by_id: dict[str, Transaction] = {}
    for tx in transactions:
        by_id.setdefault(tx.id, tx)
    return sorted(by_id.values())
