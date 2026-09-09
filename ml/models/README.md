# Trained model artifacts (runtime data, not source-controlled)

This directory holds the two trained model bundles the backend loads at
request time. Both are gitignored (`ml/models/*.joblib` in the root
`.gitignore`) — regenerable from tracked code and (for `aml_baseline`)
separately-prepared data, not committed because trained binaries don't
belong in version control and because retraining must always be an
explicit, auditable, offline action, never something that happens silently
during a build or at application startup.

This file itself is tracked so the directory exists on a fresh checkout —
without it, `git clone` would produce no `ml/models/` directory at all
(git does not track empty directories), and the root `Dockerfile`'s
`COPY ml/models/ ./ml/models/` step needs the directory to exist even when
it's empty of actual model files. See `Dockerfile.dockerignore` for how the
build only ever includes `*.joblib` files that are actually present.

## `xgb_baseline.joblib` — standalone card-fraud model

- **Trains from:** `ml/xgb_baseline/` (`ml/scripts/run_xgb_baseline.py`),
  against the OpenML credit-card fraud dataset. Needs
  `ml/data/raw/creditcard_openml_1597.parquet` (gitignored, large — see
  `ml/xgb_baseline/README.md` for how to obtain it) and `ml/requirements.txt`
  installed.
- **Train command** (from the repo root):
  ```powershell
  python -m venv ml/.venv
  ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
  ml/.venv/Scripts/python.exe ml/scripts/run_xgb_baseline.py
  ```
- **Serves:** `POST /api/xgb-score` only (`backend/app/adapters/xgb_baseline.py`).
  Never wired into `/api/graph` or account risk — a structurally unrelated,
  card-present fraud model (see `backend/docs/integration-contract.md`).
- **Version/metadata:** recorded in `ml/reports/` alongside the trained
  bundle each time `ml/scripts/run_xgb_baseline.py` runs — check that
  report for the exact evaluation numbers behind any given `.joblib`.
- **Checksum of the artifact trained and verified in this project's own
  session** (2026-09-09; confirms a copied/downloaded file is byte-identical
  to the one the recorded evaluation numbers describe — retraining is not
  guaranteed to reproduce this exact byte sequence, even with a fixed seed,
  across different xgboost/numpy/platform versions):
  ```
  sha256  11686ab7fbbeb35a267adbf195223566550739ea5e27dd8d782793d539837311  ml/models/xgb_baseline.joblib
  ```

## `aml_baseline.joblib` — IBM AML transfer classifier

- **Trains from:** `ml/aml_baseline/` (`ml/scripts/run_aml_baseline.py`),
  against `ml/data/aml/splits/*.csv` (gitignored — produced by
  `scripts/prepare_aml_dataset.py` from a user-supplied IBM AML source file;
  see `data/aml/README.md` and that script's own docstring) and
  `ml/requirements.txt` installed.
- **Train command** (from the repo root, after `ml/data/aml/splits/` is populated):
  ```powershell
  python -m venv ml/.venv
  ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
  ml/.venv/Scripts/python.exe ml/scripts/run_aml_baseline.py
  ```
- **Serves:** `POST /api/aml/assess` only (`backend/app/adapters/aml_baseline.py`).
  A transaction-level classifier for the IBM synthetic AML benchmark — never
  merged with `ml/rules`' account/network-level findings, never applied to
  the canonical UPI demo.
- **Version/metadata:** `ml/reports/aml_baseline_metrics.json`, written by
  the same training run — `model_version`, the validation-selected
  threshold, and the full precision/recall/F1/PR-AUC/confusion-matrix
  numbers for both validation and test splits.
- **Checksum of the artifact trained and verified in this project's own
  session** (2026-09-09; same caveat as above — training is not claimed to
  be bit-for-bit reproducible):
  ```
  sha256  6009f941e18ecbf96aa1b13d7671d3ff8793941f57325cd422dc0e1bf3be745a  ml/models/aml_baseline.joblib
  ```

## Verifying a checksum

```powershell
# PowerShell
Get-FileHash ml/models/xgb_baseline.joblib -Algorithm SHA256
```
```bash
# macOS/Linux
sha256sum ml/models/xgb_baseline.joblib
```

## What this directory intentionally does not do

- Nothing here is downloaded automatically. Both source datasets require the
  user's own action (an OpenML fetch for `xgb_baseline`'s raw parquet, a
  licensed Kaggle download for `aml_baseline`'s source CSV) — see each
  model's own README for exactly what's required and why it isn't automated.
- Nothing here retrains during application startup. `backend/app/adapters/
  {xgb_baseline,aml_baseline}.py` only ever *load* an already-trained
  `.joblib` file, lazily, on first use of the corresponding endpoint; if the
  file is missing, the endpoint returns `503` with an explanatory message
  (see `backend/docs/integration-contract.md` and
  `backend/docs/aml-integration-contract.md`) — it never falls back to
  training one on the spot.
