"""AML transaction-classification baseline: a compatible model for IBM's
synthetic AML benchmark (account-to-account ACH/Wire transfers), trained on
`ml/data/aml/splits/` -- see `data/aml/README.md` for dataset provenance.

Structurally independent of `ml/xgb_baseline` (unrelated card-fraud model,
V1..V28 PCA schema) and of `ml/rules` (hand-defined fan-out/convergence
heuristic). Do not import between these packages; each stays a self-
contained artifact per CLAUDE.md's ML/backend boundary conventions.

Requires the project-local environment at ml/.venv (xgboost, pandas, numpy,
scikit-learn -- see ml/requirements.txt, the same versions ml/xgb_baseline
uses).
"""
