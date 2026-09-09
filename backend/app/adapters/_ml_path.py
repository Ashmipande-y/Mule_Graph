"""Shared helper: put the repository's `ml/` directory on `sys.path` once.

Both `ml_rules.py` and `xgb_baseline.py` use this so there is exactly one
place (per backend/README.md's Stage 2 note: "Keep that setup explicit in
one adapter/launch configuration, independent of the working directory")
that decides how `ml/` is located, instead of two adapters each computing
their own repo-relative path.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ML_DIR = _REPO_ROOT / "ml"


def ensure_ml_on_path() -> None:
    if str(_ML_DIR) not in sys.path:
        sys.path.insert(0, str(_ML_DIR))
