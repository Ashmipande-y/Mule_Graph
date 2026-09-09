"""Dataset loading for the AML transaction classifier.

Loads the pre-split, pre-featurized CSVs supplied with the prepared IBM AML
package (`ml/data/aml/splits/`) -- see `data/aml/README.md` for provenance
and how to regenerate them. This module does not recompute features (the
supplied `*_features.csv` files already are the causal features, produced by
the same algorithm `ml/aml_baseline/features.py` implements -- see that
module's parity tests); it only loads, joins, and validates them.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .features import FEATURE_COLUMNS

ML_DIR = Path(__file__).resolve().parent.parent
AML_DATA_DIR = ML_DIR / "data" / "aml" / "splits"

LABEL_COLUMN = "is_laundering"
ID_COLUMN = "id"

SPLITS = ("train", "validation", "test")


class DatasetIntegrityError(Exception):
    """Raised when a split's transactions/features/labels files don't align 1:1 by id."""


@dataclass(frozen=True)
class SplitData:
    """One split, ready for fitting: `features` has exactly FEATURE_COLUMNS
    (id already dropped), `labels` is a 0/1 Series aligned to `features` by
    position, and `ids`/`transactions` are kept only for traceability
    (never used as model inputs)."""

    ids: pd.Series
    features: pd.DataFrame
    labels: pd.Series
    transactions: pd.DataFrame


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Populate ml/data/aml/splits/ first -- see data/aml/README.md."
        )
    return pd.read_csv(path)


def load_split(name: str, data_dir: Path = AML_DATA_DIR) -> SplitData:
    """Loads one split, joins transactions/features/labels by `id`, and
    verifies one-to-one alignment (every id present in all three files,
    exactly once each) before returning. Raises DatasetIntegrityError on any
    mismatch rather than silently reindexing/dropping rows.
    """
    if name not in SPLITS:
        raise ValueError(f"unknown split {name!r}; expected one of {SPLITS}")

    transactions = _read_csv(data_dir / f"{name}_transactions.csv")
    features = _read_csv(data_dir / f"{name}_features.csv")
    labels = _read_csv(data_dir / f"{name}_labels.csv")

    for frame, label in ((transactions, "transactions"), (features, "features"), (labels, "labels")):
        if frame[ID_COLUMN].duplicated().any():
            raise DatasetIntegrityError(f"{name}_{label}.csv contains duplicate ids")

    tx_ids = set(transactions[ID_COLUMN])
    feature_ids = set(features[ID_COLUMN])
    label_ids = set(labels[ID_COLUMN])
    if not (tx_ids == feature_ids == label_ids):
        missing_from_features = tx_ids - feature_ids
        missing_from_labels = tx_ids - label_ids
        extra_in_features = feature_ids - tx_ids
        extra_in_labels = label_ids - tx_ids
        raise DatasetIntegrityError(
            f"{name}: transactions/features/labels do not align 1:1 by id "
            f"(missing_from_features={len(missing_from_features)}, missing_from_labels={len(missing_from_labels)}, "
            f"extra_in_features={len(extra_in_features)}, extra_in_labels={len(extra_in_labels)})"
        )

    missing_columns = [c for c in FEATURE_COLUMNS if c not in features.columns]
    if missing_columns:
        raise DatasetIntegrityError(f"{name}_features.csv is missing expected column(s): {missing_columns}")

    # Join on id explicitly (not positional trust), then drop id before returning features.
    ordered = transactions[[ID_COLUMN]].merge(features, on=ID_COLUMN, how="left").merge(
        labels, on=ID_COLUMN, how="left"
    )
    ids = ordered[ID_COLUMN].reset_index(drop=True)
    X = ordered[FEATURE_COLUMNS].reset_index(drop=True)
    y = ordered[LABEL_COLUMN].astype(int).reset_index(drop=True)

    return SplitData(ids=ids, features=X, labels=y, transactions=transactions.reset_index(drop=True))


def load_all_splits(data_dir: Path = AML_DATA_DIR) -> dict[str, SplitData]:
    return {name: load_split(name, data_dir) for name in SPLITS}
