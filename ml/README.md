# ML

Status: **Stage 0 (data foundation), Stage 1 (rules/replay), and Stage 2 (XGBoost
baseline) complete.** Stage 3 (GraphSAGE) untouched — dual-gated (see below).

## What exists right now

- `data/demo_transactions.json` — the canonical seven-transaction demo scenario
  (fan-out from `ACC_VICTIM` through `ACC_A` into `ACC_B`/`ACC_C`/`ACC_D`, converging
  on `ACC_X`). This is the runtime source of truth for the transaction data.
- `data/graph.example.json` — the same scenario pre-computed into the `/api/graph`
  node/edge contract shape, for frontend development before the backend endpoint
  exists.
- `scripts/validate_demo.py` — stdlib-only validator that checks both files are
  internally consistent and agree with each other. Run from the repo root:

  ```powershell
  python scripts/validate_demo.py
  ```

  Exit code 0 and a one-line summary on success; nonzero with a message naming the
  offending record/field on failure. Supports `--transactions` / `--graph` to check
  alternate fixture paths.
- `docs/ml/environment.md` — an as-observed snapshot of this machine's Python, RAM,
  and GPU/CUDA situation, for whoever (likely Jatin) picks framework versions for
  Stage 2 (XGBoost) and Stage 3 (GraphSAGE). Headline finding: a GPU (GTX 1650, 4GB)
  and driver are present, but the installed PyTorch is a CPU-only build — GPU training
  is **not yet verified to work** on this machine.
- `docs/handoffs/ml-foundation.md` — the Stage 0 handoff record.
- `ml/rules/` — **Stage 1**: a CPU-only, stdlib-only deterministic fan-out ->
  convergence detector, plus replay (no-future-leakage) and account-level risk
  aggregation. Independent of FastAPI, any database, and the frontend. Run the demo:

  ```powershell
  python ml/scripts/run_rules_demo.py
  python -m unittest discover -s ml/tests -t ml
  ```

  Full design and the score's exact meaning (a heuristic, not a probability) are in
  `ml/docs/stage1-rules-replay.md`; the implementation handoff with test results is
  in `ml/docs/handoffs/stage1-rules-replay.md`.
- `ml/xgb_baseline/` — **Stage 2**: a standalone CPU XGBoost fraud classifier,
  trained and evaluated on a real (non-synthetic), openly and verifiably licensed
  dataset (OpenML "creditcard", id 1597 — IBM AML and Elliptic were both checked
  first and are blocked behind Kaggle login in this environment; see the design
  doc for the full verification trail). Needs the project-local venv:

  ```powershell
  python -m venv ml/.venv
  ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
  ml/.venv/Scripts/python.exe ml/scripts/run_xgb_baseline.py
  ml/.venv/Scripts/python.exe -m unittest discover -s ml/xgb_baseline/tests -t ml
  ```

  Test-set results: precision 0.889, recall 0.747, F1 0.812, PR-AUC 0.795,
  ROC-AUC 0.969 (threshold chosen on validation only). Full numbers, dataset
  provenance, feature/label/split definitions, and limitations (most importantly:
  this dataset has no account/graph structure, so it validates the *pipeline*, not
  MuleGraph's actual mule-detection domain) are in
  `ml/docs/stage2-xgboost-baseline.md`; the handoff with exact commands is in
  `ml/docs/handoffs/stage2-xgboost-baseline.md`.

## What does not exist yet (by design — do not start early)

- No GraphSAGE/PyTorch Geometric code.
- No integration between `ml/rules` or `ml/xgb_baseline` and FastAPI/the
  database/the frontend — no interface has been agreed with Smit for either.
- A real IBM AML (or equivalent AML-domain) dataset has not been acquired — it
  remains blocked behind Kaggle authentication this environment doesn't have.

## Stage gating

- Stage 1 (rules/replay) and Stage 2 (XGBoost baseline) were both implementable
  ML-only, independent of the app, so both are done now.
- **Stage 3 (GraphSAGE) is untouched and dual-gated**: it requires both the
  application integration gate (`docs/milestone-1.md` — `backend/` and
  `frontend/` are still empty placeholders) **and** this XGBoost baseline to be
  working, which it now is. Only the integration half is still unmet. No PyTorch
  Geometric code, imports, or installs exist anywhere in this repository.
- `ml/rules` remains runnable with zero training-framework dependencies —
  re-verified after adding `ml/xgb_baseline`: `python -m unittest discover -s
  ml/tests -t ml` still passes all 24 tests on the system Python, which has no
  `xgboost` installed at all.

## Progression (for context — not all authorized yet)

1. **Stage 0 — data foundation** (complete): canonical fixtures, validator, shared
   contract docs, environment assessment.
2. **Stage 1 — rules/replay** (complete, ML-only): CPU-only deterministic
   fan-out/convergence detector, independent of FastAPI/DB/frontend, using only
   transactions observable at evaluation time.
3. **Stage 2 — XGBoost baseline** (complete, ML-only): real dataset (OpenML
   creditcard; IBM AML blocked behind Kaggle auth), leakage-safe chronological
   split, full metric reporting, CPU-only, reproducible from `ml/requirements.txt`.
4. **Stage 3 — optional GraphSAGE** (not started): only after the application
   integration gate is also met and requested; smallest viable PyTorch Geometric
   setup; rules/XGBoost must keep working without importing GraphSAGE code.
5. **Stage 4 — integration and freeze**: one documented inference interface, fallback
   ladder GraphSAGE -> XGBoost -> rules, explanations kept outside the decision path.

## For Jatin (ML lead) picking this up

- Read the three handoffs in order: `docs/handoffs/ml-foundation.md` (Stage 0),
  `ml/docs/handoffs/stage1-rules-replay.md` (Stage 1),
  `ml/docs/handoffs/stage2-xgboost-baseline.md` (Stage 2) — all have exact
  commands run and results, not just summaries.
- The canonical scenario's account IDs and display labels (`ACC_VICTIM`, `Collector
  X`, etc.) are demo-authoring choices, not real signal. Never use them, or the
  account IDs themselves, as model features later. `ml/rules/detector.py` already
  follows this — it never references a specific account id or the fixture.
- The XGBoost baseline's dataset (credit-card fraud) has no account/graph
  structure — it's a pipeline validation, not a MuleGraph-domain result. Don't
  cite its metrics as "the model's accuracy on mule detection."
- Re-run `python scripts/validate_demo.py` and
  `python -m unittest discover -s ml/tests -t ml` (system Python) before trusting
  the fixtures or the rules engine; re-run
  `ml/.venv/Scripts/python.exe -m unittest discover -s ml/xgb_baseline/tests -t ml`
  before trusting the XGBoost baseline. All docs here are a snapshot, the scripts
  are the live check.
- If Kaggle credentials become available, re-acquiring IBM AML and re-pointing
  `xgb_baseline/dataset.py` / `features.py` at its actual schema (sender/receiver/
  bank/account fields, not PCA components) is the natural next step before this
  baseline can speak to MuleGraph's real domain.
