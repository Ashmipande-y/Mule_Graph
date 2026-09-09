# AML transaction-classification baseline

A compatible model for IBM's synthetic AML benchmark (account-to-account
ACH/Wire transfers) — see `data/aml/README.md` for dataset provenance and
`backend/docs/aml-integration-contract.md` for the full integration writeup
and real evaluation results.

Structurally independent of `ml/xgb_baseline` (unrelated card-fraud model)
and `ml/rules` (heuristic detector) — no shared imports.

## Setup and training (from the repo root)

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
ml/.venv/Scripts/python.exe ml/scripts/run_aml_baseline.py
```

Requires `ml/data/aml/splits/{train,validation,test}_{transactions,features,labels}.csv`
to be populated first (see `data/aml/README.md`). Writes
`ml/models/aml_baseline.joblib` and `ml/reports/aml_baseline_metrics.json`.

## Tests

```powershell
$env:PYTHONPATH="ml"; ml/.venv/Scripts/python.exe -m unittest discover -s ml/aml_baseline/tests -t ml
```

Dataset- and model-dependent tests skip automatically if
`ml/data/aml/splits/` or the trained model aren't present.
