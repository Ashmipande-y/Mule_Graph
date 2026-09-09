"""Loads, validates, and serves the IBM AML transfer dataset for the
`/api/aml/*` endpoints.

Optional dependency (pandas, from `backend/requirements-xgb.txt`) --
imported lazily inside `_load_base_dataset`, never at module import time, so
`/health`, `/api/graph`, and `/api/xgb-score` are unaffected if it isn't
installed (same policy as `backend/app/adapters/xgb_baseline.py`).

Loaded and cached **once per process** (`functools.lru_cache`): unlike
`app/services/graph.py`'s canonical demo file (deliberately re-read every
request, per CLAUDE.md, because it's tiny and mutable-in-spirit), this
dataset is 27,511 rows and immutable at runtime -- re-parsing it on every
request would be wasteful for no correctness benefit.

This is the IBM synthetic AML benchmark -- NOT real UPI customer data. Every
response this module's callers build must say so explicitly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.services import aml_session
from app.services.aml_types import AmlRecord

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$")
SUPPORTED_CURRENCIES = ("INR",)
SUPPORTED_PAYMENT_FORMATS = ("ACH", "Wire")

DATASET_LABEL = "IBM synthetic AML benchmark"


class AmlDatasetError(Exception):
    """Raised when the dataset file is missing, malformed, or optional deps aren't installed."""


class AmlValidationError(Exception):
    """Raised when a caller-supplied transaction record fails validation."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


def validate_record(
    id_: object,
    sender: object,
    receiver: object,
    amount_paise: object,
    currency: object,
    timestamp: object,
    payment_format: object,
) -> AmlRecord:
    """Validates one record against the AML transfer contract (see
    `frontend/docs/aml-endpoint-contract.md`). Raises AmlValidationError with
    a `field` naming the offending property, never silently coerces."""
    if not isinstance(id_, str) or not id_:
        raise AmlValidationError("id must be a nonempty string", field="id")
    if not isinstance(sender, str) or not sender:
        raise AmlValidationError("sender must be a nonempty string", field="sender")
    if not isinstance(receiver, str) or not receiver:
        raise AmlValidationError("receiver must be a nonempty string", field="receiver")
    if sender == receiver:
        raise AmlValidationError("sender and receiver must differ", field="receiver")
    if isinstance(amount_paise, bool) or not isinstance(amount_paise, int) or amount_paise <= 0:
        raise AmlValidationError("amount_paise must be a positive integer (not a boolean)", field="amount_paise")
    if currency not in SUPPORTED_CURRENCIES:
        raise AmlValidationError(
            f"unsupported currency {currency!r}; supported: {SUPPORTED_CURRENCIES}", field="currency"
        )
    if not isinstance(timestamp, str) or not TIMESTAMP_PATTERN.match(timestamp):
        raise AmlValidationError(
            "timestamp must be minute-precision UTC ISO 8601, e.g. 2022-09-01T00:00:00Z (seconds must be '00')",
            field="timestamp",
        )
    if payment_format not in SUPPORTED_PAYMENT_FORMATS:
        raise AmlValidationError(
            f"unsupported payment format {payment_format!r}; supported: {SUPPORTED_PAYMENT_FORMATS}",
            field="payment_format",
        )
    return AmlRecord(
        id=id_,
        sender=sender,
        receiver=receiver,
        amount_paise=amount_paise,
        currency=currency,
        timestamp=timestamp,
        payment_format=payment_format,
    )


@lru_cache(maxsize=1)
def _load_base_dataset(path: Path) -> tuple[AmlRecord, ...]:
    if not path.exists():
        raise AmlDatasetError(f"AML dataset not found at {path}. See data/aml/README.md to populate it.")
    try:
        import pandas as pd
    except ImportError as exc:
        raise AmlDatasetError(
            f"AML dataset support requires the optional stack in backend/requirements-xgb.txt (pandas): {exc}"
        ) from exc

    frame = pd.read_csv(path, dtype=str, keep_default_na=False)
    expected_columns = ["id", "sender", "receiver", "amount_paise", "currency", "timestamp", "payment_format"]
    if list(frame.columns) != expected_columns:
        raise AmlDatasetError(f"unexpected AML dataset columns: {list(frame.columns)}")

    records: list[AmlRecord] = []
    seen_ids: set[str] = set()
    for row in frame.itertuples(index=False):
        if row.id in seen_ids:
            raise AmlDatasetError(f"duplicate transaction id in source dataset: {row.id}")
        seen_ids.add(row.id)
        try:
            amount = int(row.amount_paise)
        except ValueError as exc:
            raise AmlDatasetError(f"non-integer amount_paise for {row.id}: {row.amount_paise!r}") from exc
        record = validate_record(row.id, row.sender, row.receiver, amount, row.currency, row.timestamp, row.payment_format)
        records.append(record)

    records.sort(key=lambda r: (r.timestamp, r.id))
    return tuple(records)


def _base_dataset() -> tuple[AmlRecord, ...]:
    return _load_base_dataset(get_settings().aml_transfers_path)


def reset_cache_for_tests() -> None:
    _load_base_dataset.cache_clear()


def all_known_ids() -> set[str]:
    """Base dataset ids plus session-committed ids -- the full uniqueness scope for new submissions."""
    return {r.id for r in _base_dataset()} | aml_session.get_session_ids()


def all_records_sorted() -> list[AmlRecord]:
    """Base dataset plus session-committed transactions, chronologically merged."""
    merged = list(_base_dataset()) + aml_session.get_session_records()
    merged.sort(key=lambda r: (r.timestamp, r.id))
    return merged


@dataclass(frozen=True)
class DatasetSummary:
    label: str
    source: str
    currency: str
    amount_unit: str
    timestamp_timezone_note: str
    total_transactions: int
    total_accounts: int
    period_start: str | None
    period_end: str | None
    session_transaction_count: int
    scoring_method: str


def get_summary() -> DatasetSummary:
    base = _base_dataset()
    session_records = aml_session.get_session_records()
    all_records = list(base) + session_records
    accounts: set[str] = set()
    for r in all_records:
        accounts.add(r.sender)
        accounts.add(r.receiver)
    timestamps = [r.timestamp for r in all_records]
    return DatasetSummary(
        label=DATASET_LABEL,
        source="IBM AML HI-Small v8 (Kaggle: ealtman2019/ibm-transactions-for-anti-money-laundering-aml), INR ACH/Wire transfer view",
        currency="INR",
        amount_unit="paise (divide by 100 for INR)",
        timestamp_timezone_note="UTC assumed for simulation; source timezone unspecified; minute precision",
        total_transactions=len(all_records),
        total_accounts=len(accounts),
        period_start=min(timestamps) if timestamps else None,
        period_end=max(timestamps) if timestamps else None,
        session_transaction_count=len(session_records),
        scoring_method="aml_baseline (XGBoost, trained offline) when available -- see /api/aml/assess",
    )


@dataclass(frozen=True)
class TransactionPage:
    items: list[AmlRecord]
    next_cursor: int | None
    total_matching: int


def list_transactions(
    after: str | None = None,
    before: str | None = None,
    account: str | None = None,
    cursor: int = 0,
    limit: int = 50,
) -> TransactionPage:
    """Paginated, filterable transaction list. Never returns the whole
    dataset in one response -- `limit` is clamped to a sane maximum."""
    limit = max(1, min(limit, 500))
    cursor = max(0, cursor)

    records = all_records_sorted()
    if after is not None:
        records = [r for r in records if r.timestamp >= after]
    if before is not None:
        records = [r for r in records if r.timestamp <= before]
    if account is not None:
        records = [r for r in records if r.sender == account or r.receiver == account]

    total_matching = len(records)
    page = records[cursor : cursor + limit]
    next_cursor = cursor + limit if cursor + limit < total_matching else None
    return TransactionPage(items=page, next_cursor=next_cursor, total_matching=total_matching)


@dataclass(frozen=True)
class GraphNeighborhood:
    nodes: list[str]
    edges: list[AmlRecord]
    seed_account: str | None


def get_neighborhood(account: str | None = None, max_nodes: int = 40, max_edges: int = 120) -> GraphNeighborhood:
    """A bounded, deterministic BFS neighborhood -- never the whole dataset.

    With no `account` given, seeds from the highest-degree account (mirrors
    the prepared dataset's own `network_preview.json` selection method: a
    label-independent, deterministic "largest hub" view, not a detection
    result). With `account` given, seeds from that account specifically so
    an analyst can explore around one transaction's parties.
    """
    max_nodes = max(1, min(max_nodes, 200))
    max_edges = max(1, min(max_edges, 500))

    records = all_records_sorted()
    if not records:
        return GraphNeighborhood(nodes=[], edges=[], seed_account=account)

    adjacency: dict[str, list[int]] = {}
    for index, record in enumerate(records):
        adjacency.setdefault(record.sender, []).append(index)
        adjacency.setdefault(record.receiver, []).append(index)

    if account is not None:
        if account not in adjacency:
            return GraphNeighborhood(nodes=[account], edges=[], seed_account=account)
        seed = account
    else:
        seed = min(adjacency, key=lambda acc: (-len(adjacency[acc]), acc))

    accounts = {seed}
    queue = [seed]
    edge_indices: set[int] = set()
    queue_pos = 0
    while queue_pos < len(queue) and len(edge_indices) < max_edges:
        current = queue[queue_pos]
        queue_pos += 1
        for index in adjacency.get(current, []):
            if index in edge_indices:
                continue
            record = records[index]
            other = record.receiver if record.sender == current else record.sender
            if other not in accounts:
                if len(accounts) >= max_nodes:
                    continue
                accounts.add(other)
                queue.append(other)
            edge_indices.add(index)
            if len(edge_indices) >= max_edges:
                break

    edges = sorted((records[i] for i in edge_indices), key=lambda r: (r.timestamp, r.id))
    return GraphNeighborhood(nodes=sorted(accounts), edges=edges, seed_account=account)
