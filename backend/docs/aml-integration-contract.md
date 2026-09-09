# AML dataset integration contract

Status: implemented and verified 2026-09-09, at the repo owner's explicit
request to integrate the prepared IBM AML dataset. Documents what was
actually shipped, following this repo's existing convention
(`backend/docs/integration-contract.md`) of recording real behavior, not a
plan.

## What this is

A second, independent dataset/model track alongside the canonical seven-
transaction UPI demo (`GET /api/graph`, `ml/rules` at 60-second scale) and
the standalone card-fraud model (`POST /api/xgb-score`, `ml/xgb_baseline`).
Everything here is **IBM's synthetic AML benchmark — not real UPI customer
data** (see `data/aml/README.md` for full provenance). Neither existing
track was modified.

## New modules

- `ml/aml_baseline/` — a new, independent ML package (dataset/features/
  train/evaluate/inference), structured exactly like `ml/xgb_baseline/` and
  equally independent of it and of `ml/rules`. Trained model:
  `ml/models/aml_baseline.joblib` (gitignored, like `xgb_baseline.joblib`);
  metrics: `ml/reports/aml_baseline_metrics.json`.
- `backend/app/adapters/aml_baseline.py` — lazy-loads the trained model,
  mirrors `xgb_baseline.py`'s pattern exactly.
- `backend/app/adapters/aml_rules.py` — reuses `ml/rules`' fan-out/
  convergence detector at a **dataset-appropriate timescale** (6h fan-out/
  convergence windows, 24h scoring window — see `AML_DETECTOR_CONFIG` in
  that file), independent of `ml_rules.py`'s 60-second UPI config. Verified
  on the real dataset: the label-independent default hub neighborhood finds
  0 patterns, and a neighborhood seeded from a known laundering account
  *also* finds 0 patterns at this scale — an honest result (this dataset's
  actual laundering topology in the transfer-only view isn't a fan-out/
  convergence shape at this granularity), not a manufactured one.
- `backend/app/services/aml_dataset.py` — loads and caches
  `data/aml/transfers_inr.csv` (27,511 rows) **once per process** (unlike
  `services/graph.py`'s canonical demo file, re-read every request on
  purpose for its tiny fixture). Validates every row against the same rules
  new submissions are validated against.
- `backend/app/services/aml_session.py` — in-memory, per-process,
  session-local store for analyst-committed transactions. Resets on
  restart; no persistence, no multi-user isolation (consistent with this
  backend's existing "in-memory demo state" approach).
- `backend/app/api/aml.py` — the five endpoints below.

This extends the invariant in `CLAUDE.md` ("only `ml_rules.py` and
`xgb_baseline.py` import from `ml/`") to also allow `aml_baseline.py` and
`aml_rules.py`, following the identical one-file-per-ml-package,
`ensure_ml_on_path()`-only pattern.

## Endpoints

All under `/api/aml`. None of `/health`, `/api/graph`, `/api/xgb-score` are
changed by any of these.

| Method & path | Purpose | Model required? |
| --- | --- | --- |
| `GET /api/aml/summary` | Period, transaction/account counts, source label, scoring method, `model_available` | No |
| `GET /api/aml/transactions?after=&before=&account=&cursor=&limit=` | Paginated, filterable transaction list (base dataset + session-committed, merged) | No |
| `GET /api/aml/graph?account=&max_nodes=&max_edges=` | Bounded BFS neighborhood (default: largest-degree hub, mirroring the prepared package's own `network_preview.json` selection) plus rules findings *for that neighborhood only* | No (rules-based) |
| `POST /api/aml/assess` | Scores 1-100 proposed transactions against current history; **never commits them** | Yes -- 503 if unavailable |
| `POST /api/aml/session/transactions` | Commits 1-100 transactions to session history; rejects any id already in the base dataset or an earlier commit (409) | No |

`GET /api/aml/summary`, `/transactions`, and `/graph` all still require the
optional `backend/requirements-xgb.txt` stack (pandas, for CSV loading) --
if unavailable, `AmlDatasetError` surfaces as `500`. This is a small,
deliberate widening of "keep optional ML deps out of startup": startup
itself never imports pandas, but this whole feature area's dataset access
does, same as `/api/xgb-score`'s existing optional-dependency policy.

## Assessment semantics (explicit, per the brief's requirement)

- **A proposed transaction is scored *before* being added to any history.**
  `POST /api/aml/assess` is read-only with respect to the dataset/session --
  it never mutates anything. Only `POST /api/aml/session/transactions`
  commits.
- **Batch = repeated single.** A batch of N proposed transactions is sorted
  by `(timestamp, id)` and scored sequentially; each transaction's features
  see the base dataset + session history **plus** whichever earlier
  transactions in the *same batch* have already been processed -- exactly
  as if they had been assessed one at a time, in order, after each was
  individually committed. Same-minute batch siblings still cannot see each
  other (feature computation excludes non-strictly-earlier timestamps
  regardless of processing order). Verified in
  `ml/aml_baseline/tests/test_inference.py` and
  `backend/tests/test_aml.py::test_assess_batch_sibling_sees_earlier_sibling_as_history`.
- Response order matches request order, not internal chronological
  processing order.

## Feature parity (offline vs. online)

`ml/aml_baseline/features.py::compute_features_for_target` is a from-scratch
reimplementation of the causal feature algorithm used to produce the
supplied `ml/data/aml/splits/*_features.csv` (the original
`prepare_mulegraph.py::causal_features`, an external script not part of this
repo). Verified byte-for-byte (`assertAlmostEqual`, 6 decimal places) against
the supplied features for a spread of real training rows, including rows
late in the split with substantial rolling history --
`ml/aml_baseline/tests/test_features.py::ParityWithSuppliedFeaturesTests`.

## Model training results (real, not fabricated)

Trained via `ml/scripts/run_aml_baseline.py` on the supplied chronological
splits (train: Sep 1-6, 16,666 rows/83 positive; validation: Sep 7-8, 5,345
rows/25 positive; test: Sep 9-10, 5,479 rows/18 positive). Threshold (0.87)
selected by F1 on validation only.

**Test set** (threshold 0.87): precision 0.667, recall 0.222, F1 0.333,
PR-AUC 0.244, ROC-AUC 0.845. Confusion matrix `[[TN=5459, FP=2], [FN=14,
TP=4]]`.

**With only 18 positive examples in the test set, this recall figure has
substantial sampling uncertainty** — one additional true/false positive
changes it by ~5.6 percentage points. Treat these numbers as a directional
signal, not a precise performance guarantee (see `not_the_mulegraph_upi_domain_note`
and `small_test_positive_count_caveat` in the saved model metadata).
`predict_proba` output has **not** been separately calibrated -- it is a
ranking score, not a calibrated probability of laundering.

## Validation rules (`app/services/aml_dataset.py::validate_record`)

Applied identically to the base dataset at load time and to every new
transaction submitted via `/assess` or `/session/transactions`:

- `id`/`sender`/`receiver`: nonempty strings; `sender != receiver`.
- `amount_paise`: positive integer (booleans explicitly rejected, same
  convention as the canonical demo's amount validation).
- `currency`: must be `"INR"` (the only currency this integration supports;
  `INTEGRATION_SCHEMA.json`'s `const` constraint).
- `timestamp`: minute-precision UTC ISO 8601, seconds fixed at `"00"`
  (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$`) -- matches the dataset's own
  resolution; a submitted second-precision timestamp is rejected, not
  silently floored.
- `payment_format`: must be `"ACH"` or `"Wire"` (the only two formats in the
  transfer-eligible view this integration uses).
- Duplicate `id`: rejected at dataset load (`AmlDatasetError`, fails
  startup-of-first-access), within one request (`409`), and against the
  combined base+session id set on commit (`409`).

## What is intentionally out of scope

- No account-level risk aggregation from the XGBoost classifier's
  transaction scores -- `risk_score`/`risk_level` on `/api/aml/graph` nodes
  come **only** from `ml/rules` findings, exactly parallel to the canonical
  demo's semantics. A transaction classifier score never implies an account
  is a mule or that a ring exists; see `AmlAssessResultItem` (per-transaction
  only) vs. `AmlGraphNode.risk_level` (per-account, rules-only) in
  `backend/app/schemas.py`.
- No persistence (session state is in-memory, process-lifetime only).
- No GraphSAGE -- not implemented anywhere in this repo.
