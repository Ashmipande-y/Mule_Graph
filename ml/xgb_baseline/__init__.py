"""Stage 2: standalone CPU XGBoost fraud-classification baseline.

Trained on a real, publicly downloadable, non-synthetic dataset (see
dataset.py for exact provenance) -- explicitly NOT on the seven-transaction
MuleGraph demo fixture and NOT on rule-generated labels. This package has no
dependency on ml/rules, and ml/rules has no dependency on this package: the
rules engine remains runnable with only the standard library, and this
package's evaluation is independent evidence, not a comparison against the
rules engine's own output.

Requires the project-local environment at ml/.venv (xgboost, pandas, numpy,
scikit-learn, pyarrow -- see ml/requirements.txt). Not importable from the
system Python used for ml/rules.
"""
