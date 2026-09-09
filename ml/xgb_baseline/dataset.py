"""Dataset loading and the leakage-safe chronological split.

## Provenance (verified 2026-09-07; see ml/docs/stage2-xgboost-baseline.md for
full detail and the verification trail)

- Source: OpenML dataset id 1597, name "creditcard"
  (https://www.openml.org/search?type=data&id=1597), mirroring the dataset
  originally published as "Credit Card Fraud Detection" by Andrea Dal
  Pozzolo, Olivier Caelen, and Gianluca Bontempi (Machine Learning Group,
  Universite Libre de Bruxelles, in collaboration with Worldline). Cite:
  Dal Pozzolo et al., "Calibrating Probability with Undersampling for
  Unbalanced Classification", IEEE CIDM 2015.
- License recorded by OpenML: "Public".
- Direct download (no login/API key required):
  https://data.openml.org/datasets/0000/1597/dataset_1597.pq
  Verified by this project: downloaded file MD5
  1593844f40edbdabaf5bddec4649e1c4, matching the server's ETag exactly, and
  row/column counts matching OpenML's published quality metadata exactly
  (284,807 rows; 492 minority/fraud; 284,315 majority/legitimate).
- Domain: REAL (not synthetic) European credit-card transactions from
  September 2013, over a two-day window. This is card-present/card-not-present
  payment-card fraud, NOT account-to-account money-laundering / mule-network
  fraud. It has no sender/receiver/account graph structure at all -- each row
  is one anonymized transaction with no cardholder or account identifier.
  See the design doc for why this was chosen anyway (IBM AML and Elliptic,
  the brief's two named candidates, both require an authenticated Kaggle
  session this environment does not have; this is the closest genuinely
  open, verifiably-licensed, real-world labeled fraud dataset found).
- Label meaning: `Class` is 1 if the transaction was labeled fraudulent by
  the original data providers, 0 otherwise. The exact labeling/investigation
  methodology is not disclosed by the source (confidentiality), which is a
  real, documented limitation -- we cannot audit how "fraud" was determined
  for any given row, only take the provided label as ground truth.
- Schema: `Time` (seconds elapsed since the first transaction in the
  dataset), `V1`..`V28` (PCA-transformed, anonymized features -- their
  original meaning is not disclosed), `Amount` (transaction amount),
  `Class` (label, 0/1).

## Prediction unit and decision time

The prediction unit is one transaction (one row). There is no account
entity in this dataset, so the Stage 2 brief's warning against turning
transaction labels into account labels does not arise here -- there is
nothing to aggregate up to. This is a real structural difference from
MuleGraph's own account-graph model; it is not being papered over here (see
the design doc's Limitations section).

`Time` is used as the decision-time axis: a chronological split ensures
every validation and test transaction occurs strictly after every training
transaction in wall-clock order within the two-day window, so nothing about
a later transaction (or dataset-wide statistics computed after the fact)
can leak backward into training. No cardholder/account identifier exists in
this dataset, so unlike an account-graph setting we cannot additionally
verify that "the same underlying entity" never appears in two splits --
documented as a limitation.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ML_DIR = Path(__file__).resolve().parent.parent
RAW_DATA_PATH = ML_DIR / "data" / "raw" / "creditcard_openml_1597.parquet"

TIME_COLUMN = "Time"
LABEL_COLUMN = "Class"

EXPECTED_ROW_COUNT = 284807
EXPECTED_FRAUD_COUNT = 492
EXPECTED_COLUMNS = (
    ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount", "Class"]
)

# Fractions of rows (in chronological order) assigned to each split. Chosen,
# not fit to any target: verified in ml/docs/stage2-xgboost-baseline.md that
# all three splits contain a meaningful number of both classes at these cut
# points (train=360 fraud, val=57 fraud, test=75 fraud).
TRAIN_FRACTION = 0.6
VALIDATION_FRACTION = 0.2  # remainder after train is the test fraction


class DatasetIntegrityError(Exception):
    """Raised when the raw file doesn't match the verified provenance record."""


@dataclass(frozen=True)
class DatasetSplit:
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame


def load_raw(path: Path = RAW_DATA_PATH) -> pd.DataFrame:
    """Load the raw dataset and verify it matches the recorded provenance.

    This is a guard against silently training on a different (or corrupted)
    file than the one whose provenance was actually verified.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Download it first: "
            "curl -o ml/data/raw/creditcard_openml_1597.parquet "
            "https://data.openml.org/datasets/0000/1597/dataset_1597.pq"
        )
    df = pd.read_parquet(path)

    if list(df.columns) != EXPECTED_COLUMNS:
        raise DatasetIntegrityError(f"unexpected columns: {list(df.columns)}")
    if len(df) != EXPECTED_ROW_COUNT:
        raise DatasetIntegrityError(f"expected {EXPECTED_ROW_COUNT} rows, got {len(df)}")
    fraud_count = int((df[LABEL_COLUMN].astype(int) == 1).sum())
    if fraud_count != EXPECTED_FRAUD_COUNT:
        raise DatasetIntegrityError(f"expected {EXPECTED_FRAUD_COUNT} fraud rows, got {fraud_count}")

    return df


def chronological_split(
    df: pd.DataFrame,
    train_fraction: float = TRAIN_FRACTION,
    validation_fraction: float = VALIDATION_FRACTION,
) -> DatasetSplit:
    """Split strictly by `Time`, oldest first: train, then validation, then test.

    No shuffling. No stratification. This is the leakage-safe axis available
    in this dataset: every row in `validation` occurs at or after every row
    in `train`, and every row in `test` occurs at or after every row in
    `validation`.
    """
    ordered = df.sort_values(TIME_COLUMN, kind="mergesort").reset_index(drop=True)
    n = len(ordered)
    train_end = int(n * train_fraction)
    validation_end = int(n * (train_fraction + validation_fraction))

    return DatasetSplit(
        train=ordered.iloc[:train_end].reset_index(drop=True),
        validation=ordered.iloc[train_end:validation_end].reset_index(drop=True),
        test=ordered.iloc[validation_end:].reset_index(drop=True),
    )
