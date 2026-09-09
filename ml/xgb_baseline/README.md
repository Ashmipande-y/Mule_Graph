# Standalone card-fraud baseline (`ml/xgb_baseline`)

A trained XGBoost classifier for the OpenML "creditcard" dataset (id 1597) —
real, anonymized card-present/card-not-present transactions, **not**
account-to-account transfers. Structurally unrelated to `ml/rules` (the
account-graph fan-out/convergence detector) and to `ml/aml_baseline` (the
IBM AML transfer classifier): no shared imports, no shared schema, never
wired into `/api/graph` or account risk. See `dataset.py`'s module docstring
for full provenance detail and `backend/docs/integration-contract.md` for
how the trained model is served.

## Getting the raw data

This project does not redistribute the raw dataset. It requires no
credentials or login (OpenML serves it as a direct, public download), but is
still never fetched automatically by any script or container — obtain it
yourself:

```powershell
New-Item -ItemType Directory -Force ml/data/raw | Out-Null
curl -o ml/data/raw/creditcard_openml_1597.parquet https://data.openml.org/datasets/0000/1597/dataset_1597.pq
```

`load_raw()` (`dataset.py`) verifies the downloaded file's row count
(284,807), column set, and fraud-label count (492) against the recorded
provenance before anything trains on it — a mismatch raises
`DatasetIntegrityError` rather than silently training on the wrong file.

## Setup and training (from the repo root)

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
ml/.venv/Scripts/python.exe ml/scripts/run_xgb_baseline.py
```

Writes `ml/models/xgb_baseline.joblib` and `ml/reports/xgb_baseline_metrics.json`
(the latter carries the model version and full evaluation numbers — see
`ml/models/README.md` for the recorded checksum of the artifact this
project actually trained and verified). Training is always this explicit,
offline command — never triggered by starting the backend or building the
Docker image.

## Tests

```powershell
ml/.venv/Scripts/python.exe -m unittest discover -s ml/xgb_baseline/tests -t ml
```

Tests needing the raw dataset (`ml/data/raw/creditcard_openml_1597.parquet`)
or the trained model (`ml/models/xgb_baseline.joblib`) skip automatically,
with a clear reason, when either is absent — same convention as
`ml/aml_baseline/tests`.
