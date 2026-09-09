#!/usr/bin/env python3
"""Prepare MuleGraph's IBM AML dataset files from a user-supplied source CSV.

This is the tracked, in-repo equivalent of the ad hoc `prepare_mulegraph.py`
script this project's AML integration was originally converted with. It
takes a source file **you already downloaded yourself** and produces exactly
the files `data/aml/README.md` documents:

    data/aml/transfers_inr.csv
    data/aml/transfer_labels_and_splits.csv
    data/aml/legacy/transactions_whole_inr.json
    data/aml/network_preview.json
    data/aml/source_manifest.json
    data/aml/preparation_summary.json
    ml/data/aml/splits/{train,validation,test}_{transactions,features,labels}.csv

Nothing here downloads anything. Obtain the source file yourself (see
"Getting the source file" below) — this project does not redistribute IBM's
raw data and never fetches restricted/licensed datasets automatically.

## Getting the source file

Dataset: "IBM Transactions for Anti-Money Laundering (AML)"
(`ealtman2019/ibm-transactions-for-anti-money-laundering-aml` on Kaggle),
version 8, file `HI-Small_Trans.csv`. Kaggle requires an account and, for
API/CLI downloads, credentials (`~/.kaggle/kaggle.json` or the `kagglehub`
library's own auth flow) that only you can provide — this script never asks
for, stores, or invents any. Download it yourself via the Kaggle website or
`kagglehub`, then point `--source` at the local file.

## What this script verifies before touching anything

- **Source hash**: the file's SHA-256 must match `EXPECTED_SOURCE_SHA256`
  below -- the exact version 8 `HI-Small_Trans.csv` this project's schema
  assumptions, chronological splits, and documented row/label counts were
  verified against. A different version is refused with a clear error
  rather than silently converted (Kaggle dataset versions can change row
  counts, columns, or label semantics without notice) -- if you deliberately
  want to adopt a new version, update `EXPECTED_SOURCE_SHA256` yourself
  after inspecting what changed, and re-verify every count in
  `data/aml/README.md` against the new output.
- **Schema**: the source's column names must exactly match `SOURCE_COLUMNS`.
- **Currency**: only rows where both `Payment Currency` and
  `Receiving Currency` equal `"Rupee"` are kept -- no foreign-exchange
  conversion is ever performed; these are the source's own Rupee-denominated
  rows, relabeled `INR` for this project's convention.
- **Exact money handling**: amounts are parsed with `decimal.Decimal` (never
  `float`) and converted to integer paise by multiplying by 100 and
  requiring the result to be an exact integer -- a source amount that
  cannot be represented exactly as paise raises an error rather than being
  silently rounded. The source's "Amount Paid" and "Amount Received" must
  also be exactly equal (this project stores one amount per edge).
- **Timestamp assumption (documented, not verified)**: source timestamps
  (`%Y/%m/%d %H:%M`, minute precision, no timezone field at all) are treated
  as **UTC by assumption** for this simulation timeline -- this is stated
  explicitly here and in `data/aml/README.md` because it is not something
  the source data itself confirms. Every output timestamp is normalized to
  `YYYY-MM-DDTHH:MM:00Z` (the trailing `:00` is formatting to match this
  project's minute-precision convention, not added real precision).

Usage (from the repo root):

    python scripts/prepare_aml_dataset.py --source /path/to/HI-Small_Trans.csv

Requires pandas (`ml/requirements.txt`); no other part of this project's
runtime needs it just to exist as a script.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterator

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = REPO_ROOT / "data" / "aml"
DEFAULT_SPLITS_DIR = REPO_ROOT / "ml" / "data" / "aml" / "splits"

# --- Provenance this script is pinned to (see data/aml/README.md) ----------
SOURCE_DATASET = "ealtman2019/ibm-transactions-for-anti-money-laundering-aml"
SOURCE_VERSION = 8
SOURCE_FILENAME = "HI-Small_Trans.csv"
SOURCE_LICENSE = "CDLA-Sharing-1.0"
SOURCE_URL = "https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml"
EXPECTED_SOURCE_SHA256 = "b19d39f515523373f991b689c07e11e7b0b95c17a2c27a87d91584ae16c5b040"

SOURCE_COLUMNS = [
    "Timestamp", "From Bank", "Account", "To Bank", "Account.1",
    "Amount Received", "Receiving Currency", "Amount Paid", "Payment Currency",
    "Payment Format", "Is Laundering",
]
TRANSACTION_COLUMNS = ["id", "sender", "receiver", "amount_paise", "currency", "timestamp", "payment_format"]

SOURCE_TIMESTAMP_FORMAT = "%Y/%m/%d %H:%M"
OUTPUT_TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:00Z"

# Chronological split boundaries (see data/aml/README.md for the exact
# row/positive-label counts these produce against the pinned source version).
BENCHMARK_START = "2022-09-01T00:00:00Z"
TRAIN_END = "2022-09-07T00:00:00Z"
VALIDATION_END = "2022-09-09T00:00:00Z"
BENCHMARK_END = "2022-09-11T00:00:00Z"


class SourceValidationError(ValueError):
    """Raised when the supplied source file doesn't match what this script is pinned to."""


def exact_paise(value: str) -> int:
    """Converts a decimal-string amount to integer paise with zero rounding.

    Raises if the value isn't positive, isn't finite, or can't be expressed
    as a whole number of paise (e.g. a source value with more than 2 decimal
    places) -- silently rounding money is exactly what this project's money
    handling must never do.
    """
    number = Decimal(value)
    if not number.is_finite() or number <= 0:
        raise SourceValidationError(f"amount must be a positive finite number, got {value!r}")
    scaled = number * 100
    if scaled != scaled.to_integral_value():
        raise SourceValidationError(f"amount cannot be represented exactly as integer paise: {value!r}")
    return int(scaled)


def verify_source_hash(source: Path) -> str:
    with source.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    if digest != EXPECTED_SOURCE_SHA256:
        raise SourceValidationError(
            f"{source} does not match the pinned source version.\n"
            f"  expected SHA-256: {EXPECTED_SOURCE_SHA256}\n"
            f"  actual   SHA-256: {digest}\n"
            "This script is pinned to IBM AML dataset version "
            f"{SOURCE_VERSION} ({SOURCE_FILENAME}). If you intend to convert a "
            "different version, inspect its schema/row counts first, update "
            "EXPECTED_SOURCE_SHA256 deliberately, and re-verify every count "
            "documented in data/aml/README.md against the new output -- do "
            "not bypass this check silently."
        )
    return digest


def read_source_chunks(source: Path, chunksize: int = 200_000) -> Iterator[pd.DataFrame]:
    """Reads the source CSV in chunks, validating schema and stamping each
    row with its 1-based row number before any filtering -- `source_row` is
    used only for constructing a stable transaction id, never as a training
    feature."""
    offset = 0
    with pd.read_csv(source, dtype=str, keep_default_na=False, chunksize=chunksize) as reader:
        for chunk in reader:
            if list(chunk.columns) != SOURCE_COLUMNS:
                raise SourceValidationError(
                    f"unexpected source schema: {list(chunk.columns)} != {SOURCE_COLUMNS}. "
                    "The pinned source version's schema has changed or this is not the "
                    "expected file -- inspect it before converting."
                )
            chunk = chunk.copy()
            chunk["source_row"] = range(offset + 1, offset + len(chunk) + 1)
            offset += len(chunk)
            yield chunk[chunk["Payment Currency"].eq("Rupee") & chunk["Receiving Currency"].eq("Rupee")].copy()


def normalize(frame: pd.DataFrame) -> pd.DataFrame:
    """Validates and converts one already currency-filtered chunk into this
    project's transaction schema. See this module's docstring for the exact
    money/timestamp/currency assumptions enforced here."""
    if not (frame["Payment Currency"].eq("Rupee") & frame["Receiving Currency"].eq("Rupee")).all():
        raise SourceValidationError("expected only Rupee/Rupee rows at this stage")
    if not frame["Is Laundering"].isin(["0", "1"]).all():
        raise SourceValidationError("unexpected Is Laundering value (expected exactly '0' or '1')")

    paid = frame["Amount Paid"].map(exact_paise)
    received = frame["Amount Received"].map(exact_paise)
    if not paid.eq(received).all():
        raise SourceValidationError(
            "Amount Paid and Amount Received differ for at least one row -- this "
            "project stores one amount per edge and cannot represent an "
            "unequal paid/received pair without inventing a number."
        )

    timestamps = pd.to_datetime(frame["Timestamp"], format=SOURCE_TIMESTAMP_FORMAT, errors="raise")

    return pd.DataFrame(
        {
            "id": frame["source_row"].map(lambda n: f"IBM_HIS_V8_{n:09d}"),
            "sender": "IBM_HIS_V8:B" + frame["From Bank"] + ":A" + frame["Account"],
            "receiver": "IBM_HIS_V8:B" + frame["To Bank"] + ":A" + frame["Account.1"],
            "amount_paise": paid,
            "currency": "INR",
            "timestamp": timestamps.dt.strftime(OUTPUT_TIMESTAMP_FORMAT),
            "payment_format": frame["Payment Format"],
            "is_laundering": frame["Is Laundering"].astype(int),
        }
    ).sort_values(["timestamp", "id"]).reset_index(drop=True)


class RollingWindow:
    """A single account's rolling event history for one direction (in/out)
    and one window size, supporting O(1)-amortized eviction of events older
    than a moving cutoff."""

    def __init__(self) -> None:
        self.events: deque[tuple[int, str, int]] = deque()
        self.counterparties: Counter[str] = Counter()
        self.amount = 0

    def observe(self, now: int, other: str, amount: int) -> None:
        self.events.append((now, other, amount))
        self.counterparties[other] += 1
        self.amount += amount

    def snapshot(self, cutoff: int) -> tuple[int, int, int]:
        while self.events and self.events[0][0] < cutoff:
            _, other, amount = self.events.popleft()
            self.counterparties[other] -= 1
            if self.counterparties[other] == 0:
                del self.counterparties[other]
            self.amount -= amount
        return len(self.events), len(self.counterparties), self.amount


def causal_features(transactions: pd.DataFrame) -> pd.DataFrame:
    """Computes the 35-column feature set `ml/aml_baseline` trains on, using
    only strictly-earlier transactions -- never the label column, never a
    future transaction, never a reference/annotated pattern.

    All transactions sharing exactly the same source minute see the same
    historical state (they are processed as one batch, and history is only
    updated once the whole batch has been described) -- this matches
    `ml/aml_baseline/features.py`'s online/inference implementation exactly,
    which is verified in that package's own tests to reproduce these values
    for a real, already-supplied sample (see
    `ml/aml_baseline/tests/test_features.py::ParityWithSuppliedFeaturesTests`).
    """
    forbidden = {"is_laundering", "Is Laundering", "risk_score", "pattern"}
    if forbidden.intersection(transactions.columns):
        raise SourceValidationError("label or prediction column present in feature inputs")

    windows = {seconds: {direction: defaultdict(RollingWindow) for direction in ["out", "in"]} for seconds in [3600, 86400]}
    last_activity: dict[str, int] = {}
    pairs: Counter[tuple[str, str]] = Counter()
    features = []

    for timestamp, batch in transactions.sort_values(["timestamp", "id"]).groupby("timestamp", sort=True):
        dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        now = int(dt.timestamp())
        records = list(batch.itertuples(index=False))

        for tx in records:
            feature = {
                "id": tx.id,
                "amount_log1p_inr": math.log1p(tx.amount_paise / 100),
                "is_ach": int(tx.payment_format == "ACH"),
                "is_wire": int(tx.payment_format == "Wire"),
                "hour_sin": math.sin(2 * math.pi * dt.hour / 24),
                "hour_cos": math.cos(2 * math.pi * dt.hour / 24),
                "weekday": dt.weekday(),
                "pair_prior_count": pairs[(tx.sender, tx.receiver)],
            }
            for role, account in [("sender", tx.sender), ("receiver", tx.receiver)]:
                feature[f"{role}_has_prior_activity"] = int(account in last_activity)
                feature[f"{role}_seconds_since_prior_activity"] = now - last_activity[account] if account in last_activity else -1
                for seconds, hours in [(3600, 1), (86400, 24)]:
                    for direction in ["out", "in"]:
                        count, distinct, amount = windows[seconds][direction][account].snapshot(now - seconds)
                        prefix = f"{role}_{direction}_{hours}h"
                        feature[f"{prefix}_count"] = count
                        feature[f"{prefix}_distinct_accounts"] = distinct
                        feature[f"{prefix}_amount_paise"] = amount
            features.append(feature)

        # History updates happen only after every row sharing this minute
        # has been described -- same-minute siblings must never see each other.
        for tx in records:
            for seconds in windows:
                windows[seconds]["out"][tx.sender].observe(now, tx.receiver, tx.amount_paise)
                windows[seconds]["in"][tx.receiver].observe(now, tx.sender, tx.amount_paise)
            last_activity[tx.sender] = last_activity[tx.receiver] = now
            pairs[(tx.sender, tx.receiver)] += 1

    return pd.DataFrame(features)


def connected_preview(transactions: pd.DataFrame, max_accounts: int = 40, max_edges: int = 120) -> pd.DataFrame:
    """A label-independent, deterministic breadth-first view seeded from the
    largest-degree account -- a manageable starting graph for the UI, never
    a detection result (every node this produces is reported UNASSESSED)."""
    if transactions.empty:
        return transactions.copy()
    records = transactions.to_dict("records")
    adjacent: dict[str, list[int]] = defaultdict(list)
    for index, tx in enumerate(records):
        adjacent[tx["sender"]].append(index)
        adjacent[tx["receiver"]].append(index)

    seed = min(adjacent, key=lambda account: (-len(adjacent[account]), account))
    accounts = {seed}
    queue = deque([seed])
    edges: set[int] = set()
    while queue and len(edges) < max_edges:
        account = queue.popleft()
        for index in adjacent[account]:
            if index in edges:
                continue
            tx = records[index]
            other = tx["receiver"] if tx["sender"] == account else tx["sender"]
            if other not in accounts:
                if len(accounts) >= max_accounts:
                    continue
                accounts.add(other)
                queue.append(other)
            edges.add(index)
            if len(edges) >= max_edges:
                break
    return transactions.iloc[sorted(edges)].sort_values(["timestamp", "id"])


def split_for(timestamp: str) -> str:
    if timestamp < BENCHMARK_START or timestamp >= BENCHMARK_END:
        return "outside_primary_period"
    if timestamp < TRAIN_END:
        return "train"
    return "validation" if timestamp < VALIDATION_END else "test"


def write_csv(frame: pd.DataFrame, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(destination, index=False)


def prepare(frame: pd.DataFrame, data_dir: Path, splits_dir: Path) -> dict:
    data = normalize(frame)

    eligible = data.sender.ne(data.receiver) & data.payment_format.isin(["ACH", "Wire"])
    transfers = data.loc[eligible].copy()
    transfers["split"] = transfers.timestamp.map(split_for)

    write_csv(transfers[TRANSACTION_COLUMNS], data_dir / "transfers_inr.csv")
    write_csv(transfers[["id", "is_laundering", "split"]], data_dir / "transfer_labels_and_splits.csv")

    primary = transfers[transfers.split.ne("outside_primary_period")]
    features = causal_features(primary[TRANSACTION_COLUMNS])
    split_index = primary.set_index("id")["split"]
    features["split"] = features.id.map(split_index)

    split_counts = {}
    for name in ["train", "validation", "test"]:
        subset = primary[primary.split.eq(name)]
        write_csv(subset[TRANSACTION_COLUMNS], splits_dir / f"{name}_transactions.csv")
        write_csv(subset[["id", "is_laundering"]], splits_dir / f"{name}_labels.csv")
        write_csv(features[features.split.eq(name)].drop(columns="split"), splits_dir / f"{name}_features.csv")
        split_counts[name] = {
            "rows": len(subset),
            "positive_labels": int(subset.is_laundering.sum()),
            "timestamp_min": subset.timestamp.min() if len(subset) else None,
            "timestamp_max": subset.timestamp.max() if len(subset) else None,
        }

    # Legacy whole-rupee reference subset: only transfers whose paise amount
    # happens to divide evenly by 100. Documented as reference-only, never
    # the main training dataset -- see data/aml/README.md.
    legacy = transfers[transfers.amount_paise.mod(100).eq(0)].copy()
    legacy["amount"] = legacy.amount_paise.floordiv(100)
    legacy_records = legacy[["id", "sender", "receiver", "amount", "timestamp"]].to_dict("records")
    legacy_dir = data_dir / "legacy"
    legacy_dir.mkdir(parents=True, exist_ok=True)
    (legacy_dir / "transactions_whole_inr.json").write_text(json.dumps(legacy_records, indent=2), encoding="utf-8")

    preview = connected_preview(primary[TRANSACTION_COLUMNS])
    graph = {
        "metadata": {
            "source": f"IBM AML HI-Small v{SOURCE_VERSION}",
            "synthetic": True,
            "currency": "INR",
            "amount_field": "amount_paise",
            "amount_scale": 100,
            "timestamp_timezone": "UTC assumed; source timezone unspecified",
            "timestamp_resolution": "minute",
            "selection": "label-independent BFS from largest transfer hub",
            "not_a_prediction": True,
        },
        "nodes": [
            {"id": account, "label": account, "risk_score": None, "risk_level": "UNASSESSED"}
            for account in sorted(set(preview.sender) | set(preview.receiver))
        ],
        "edges": [
            {
                "id": tx.id, "source": tx.sender, "target": tx.receiver,
                "amount_paise": int(tx.amount_paise), "currency": "INR",
                "timestamp": tx.timestamp, "payment_format": tx.payment_format,
            }
            for tx in preview.itertuples()
        ],
    }
    (data_dir / "network_preview.json").write_text(json.dumps(graph, indent=2), encoding="utf-8")

    accounts = set(transfers.sender) | set(transfers.receiver)
    summary = {
        "transfer_rows": len(transfers),
        "transfer_positive_labels": int(transfers.is_laundering.sum()),
        "transfer_accounts": len(accounts),
        "excluded_non_transfer_or_self_rows": int((~eligible).sum()),
        "outside_primary_transfer_rows": int(transfers.split.eq("outside_primary_period").sum()),
        "ml_primary_rows": len(primary),
        "ml_positive_labels": int(primary.is_laundering.sum()),
        "feature_count": len(features.columns) - 2,  # exclude id and split
        "splits": split_counts,
        "legacy_rows": len(legacy),
        "legacy_positive_labels": int(legacy.is_laundering.sum()),
        "network_preview_edges": len(preview),
        "network_preview_accounts": len(graph["nodes"]),
        "zero_model_predictions_generated": True,
    }
    (data_dir / "preparation_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True, help="Path to your own downloaded HI-Small_Trans.csv (version 8).")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help=f"Output dir for dataset files (default: {DEFAULT_DATA_DIR}).")
    parser.add_argument("--splits-dir", type=Path, default=DEFAULT_SPLITS_DIR, help=f"Output dir for ml training splits (default: {DEFAULT_SPLITS_DIR}).")
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"error: {args.source} does not exist. See this script's module docstring for how to obtain it.")

    print(f"Verifying source hash against pinned IBM AML dataset version {SOURCE_VERSION}...")
    digest = verify_source_hash(args.source)
    print(f"  OK: {digest}")

    print("Reading and validating source schema...")
    frame = pd.concat(list(read_source_chunks(args.source)), ignore_index=True)
    print(f"  {len(frame)} Rupee/Rupee rows after currency filtering")

    print("Converting (exact paise, UTC-assumed minute-precision timestamps, chronological split)...")
    summary = prepare(frame, args.data_dir, args.splits_dir)

    manifest = {
        "dataset": SOURCE_DATASET,
        "version": SOURCE_VERSION,
        "file": args.source.name,
        "bytes": args.source.stat().st_size,
        "sha256": digest,
        "license": SOURCE_LICENSE,
        "source_url": SOURCE_URL,
    }
    (args.data_dir / "source_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))
    print(
        "\nDone. Wrote:\n"
        f"  {args.data_dir}/transfers_inr.csv\n"
        f"  {args.data_dir}/transfer_labels_and_splits.csv\n"
        f"  {args.data_dir}/legacy/transactions_whole_inr.json\n"
        f"  {args.data_dir}/network_preview.json\n"
        f"  {args.data_dir}/source_manifest.json\n"
        f"  {args.data_dir}/preparation_summary.json\n"
        f"  {args.splits_dir}/{{train,validation,test}}_{{transactions,features,labels}}.csv\n"
        "\nThis project's own copy of the license text (LICENSE-DATA.txt) is not "
        "generated by this script -- copy it from the Kaggle dataset page "
        "alongside these files, per data/aml/README.md.\n"
        "\nNext step: train the AML model against the splits above -- see "
        "ml/aml_baseline/README.md."
    )


if __name__ == "__main__":
    main()
