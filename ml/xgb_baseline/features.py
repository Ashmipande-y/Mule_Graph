"""Explicit feature extraction.

Feature order here IS the contract: it must match exactly what's saved in
the model metadata and what `inference.py` reconstructs at prediction time.
Nothing here is fit to the data (no scaling, no imputation) -- XGBoost trees
don't need feature scaling, so there is no preprocessing state that could be
fit on the wrong split and leak information. The only "engineered" feature,
`hour_of_window`, is a stateless deterministic function of `Time` alone.
"""

from __future__ import annotations

import pandas as pd

# The 28 anonymized PCA components, provided as-is by the data source.
PCA_FEATURE_COLUMNS = [f"V{i}" for i in range(1, 29)]

# Raw signal plus one deterministic, stateless derived feature. `Time` itself
# is deliberately excluded as a raw feature: its raw value is "seconds since
# the first transaction in this specific two-day dataset dump", which is not
# a signal that generalizes (a model that keyed on raw elapsed-seconds would
# just be memorizing where the fraud rows happened to fall in this dump).
# `hour_of_window` keeps only the cyclical time-of-day signal, which does
# generalize across days.
ENGINEERED_FEATURE_COLUMNS = ["hour_of_window"]

RAW_FEATURE_COLUMNS = PCA_FEATURE_COLUMNS + ["Amount"]

FEATURE_COLUMNS = RAW_FEATURE_COLUMNS + ENGINEERED_FEATURE_COLUMNS


def extract_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a DataFrame with exactly FEATURE_COLUMNS, in that order.

    `df` must contain `Time`, `Amount`, and V1..V28 (raw dataset schema).
    Safe to call on train, validation, test, or a single-row inference frame
    identically -- it has no fitted state.
    """
    missing = [c for c in RAW_FEATURE_COLUMNS + ["Time"] if c not in df.columns]
    if missing:
        raise ValueError(f"input is missing required column(s): {missing}")

    out = df[RAW_FEATURE_COLUMNS].copy()
    seconds_in_day = 24 * 60 * 60
    out["hour_of_window"] = (df["Time"].astype(float) % seconds_in_day) / 3600.0
    return out[FEATURE_COLUMNS]
