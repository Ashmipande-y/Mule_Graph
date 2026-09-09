#!/usr/bin/env python3
"""Train and evaluate the AML transaction classifier end to end.

Must be run with the project-local venv (has xgboost/pandas/sklearn),
NOT the system Python used for ml/rules:

    ml/.venv/Scripts/python.exe ml/scripts/run_aml_baseline.py

Reads ml/data/aml/splits/ (populate first -- see data/aml/README.md) and
writes ml/models/aml_baseline.joblib and ml/reports/aml_baseline_metrics.json.
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ML_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(ML_DIR))

from aml_baseline.train import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
