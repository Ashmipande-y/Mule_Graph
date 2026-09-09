# `POST /api/xgb-score` example rows

`xgb_score_samples.json` holds 4 real rows pulled from the model's own
**held-out test split** (never used in training) of the OpenML credit-card
dataset — 2 rows the dataset labels as fraud (`known_class: 1`), 2 labeled
legitimate (`known_class: 0`). Each row also records what
`ml/xgb_baseline`'s trained model actually predicted for it
(`model_score`, `model_is_fraud`), computed with
`ml/xgb_baseline/inference.py::predict` against `ml/models/xgb_baseline.joblib`.

This is a **fixture for demoing/testing `/api/xgb-score` with a shape the
model actually expects** (`time`, `amount`, `v`: 28 floats) — it has nothing
to do with `data/demo_transactions.json` (the mule-graph fixture) and is
not consumed by `/api/graph`. See `backend/docs/integration-contract.md`
for why the two are kept separate.

One row is deliberately a **false negative** (`known_class: 1` but
`model_is_fraud: false`) — included on purpose so this fixture doesn't
quietly imply the model is more accurate than it is. See
`ml/reports/xgb_baseline_metrics.json` for the model's actual precision/
recall on the full test split.

## Try it against a running backend

```powershell
$samples = Get-Content backend/examples/xgb_score_samples.json | ConvertFrom-Json
foreach ($s in $samples) {
    $body = @{ time = $s.time; amount = $s.amount; v = $s.v } | ConvertTo-Json
    $result = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/xgb-score" -ContentType "application/json" -Body $body
    Write-Output "$($s.label) (known_class=$($s.known_class)): score=$($result.score) is_fraud=$($result.is_fraud)"
}
```

Or run `backend/scripts/demo_xgb_score.py`, which does the same thing and
diffs the live response against the recorded `model_score`/`model_is_fraud`
in the fixture (they should match exactly — same model, same input).
