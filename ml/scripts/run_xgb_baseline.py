#!/usr/bin/env python3
"""Train and evaluate the Stage 2 XGBoost baseline end to end.

Must be run with the project-local venv (has xgboost/pandas/sklearn/pyarrow),
NOT the system Python used for ml/rules:

    ml/.venv/Scripts/python.exe ml/scripts/run_xgb_baseline.py

This has no FastAPI/database/frontend dependency. It reads
ml/data/raw/creditcard_openml_1597.parquet (download it first if missing --
see ml/xgb_baseline/dataset.py's load_raw() error message) and writes
ml/models/xgb_baseline.joblib and ml/reports/xgb_baseline_metrics.json.
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ML_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(ML_DIR))

from xgb_baseline.train import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
