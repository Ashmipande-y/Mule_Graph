# Backend/ML integration contract — risk fields on `/api/graph`

Status: proposed by the backend, not yet reviewed by Jatin or Ashmi. Per
`backend/README.md` Stage 2: "Agree the contract before changing the shared
graph or alert payloads." This documents what was actually shipped so that
review can happen against real behavior instead of a plan.

## What changed

`GET /api/graph` node `risk_score` / `risk_level` are no longer always
`null` / `"UNASSESSED"`. They are now populated by running the existing
Stage 1 rules detector (`ml/rules`) against the full transaction set on
every request, via `backend/app/adapters/ml_rules.py`.

This is a deliberate, requested deviation from the original Stage 1 scope
("Do not run the detector during static graph conversion" in
`backend/README.md`), made at the repo owner's explicit request. It has not
gone through the Stage 2 ingestion/replay path — there is still no
`POST /api/transactions`, no in-memory store, and no `/api/alerts` endpoint.
This is "detection over the static fixture," not Stage 2.

## How risk_score is derived

1. The already-validated transaction records from `app/services/graph.py`
   are converted to `ml/rules`'s `Transaction` type via `Transaction.from_dict`
   (the exact entry point `backend/README.md` documents for this).
2. `rules.replay.evaluate_at(transactions, as_of=<latest timestamp in the
   set>)` runs the fan-out/convergence detector. Using the latest timestamp
   in the set as `as_of` is the **full-fixture** case of `evaluate_at`, not a
   bypass of it: a static snapshot has nothing after its own last transaction
   that could leak in.
3. `rules.account_risk.account_risk_from_findings(findings)` rolls findings
   up to one `AccountRisk` per account that appears in at least one finding.
4. A node's `risk_score` is that account's `AccountRisk.max_score` (already a
   float in `[0, 1]`); a node absent from every finding gets `risk_score:
   null`, `risk_level: "UNASSESSED"` — **not** a zero/safe score. Absence of
   evidence is not evidence of absence.

## risk_level thresholds (PROPOSED — needs Jatin/Ashmi sign-off)

No LOW/MEDIUM/HIGH thresholds exist yet in the shared contract. The backend
picked a starting point so the field is not left meaningless:

| `risk_score` | `risk_level` |
| --- | --- |
| `>= 0.75` | `HIGH` |
| `>= 0.40` and `< 0.75` | `MEDIUM` |
| `> 0` and `< 0.40` | `LOW` |
| no finding at all | `UNASSESSED` (`risk_score: null`) |

**Update (2026-09-09):** moved into `ml/rules/account_risk.py`
(`risk_level_for_score`, `AccountRisk.risk_level`) rather than living in the
backend, per that module's own docstring: "Callers wanting to fill the API
contract's per-node `risk_score`/`risk_level` fields should go through this
module... rather than inventing their own cut points." The backend
(`backend/app/services/graph.py`) now just reads `AccountRisk.risk_level` —
it no longer has its own copy of the thresholds. Still the same unagreed
0.75/0.4 values, now with one place to change them
(`RISK_LEVEL_HIGH_THRESHOLD`, `RISK_LEVEL_MEDIUM_THRESHOLD` in
`ml/rules/account_risk.py`) once thresholds are actually agreed.

## Verified output on the canonical demo fixture

Running the detector against `data/demo_transactions.json` produces one
`fan_out_convergence` finding (`ACC_A` → `ACC_B`/`ACC_C`/`ACC_D` →
`ACC_X`, score `0.9317`). Mapped through the table above:

| Account | `risk_score` | `risk_level` |
| --- | --- | --- |
| `ACC_A` | `0.9317` | `HIGH` |
| `ACC_B` | `0.9317` | `HIGH` |
| `ACC_C` | `0.9317` | `HIGH` |
| `ACC_D` | `0.9317` | `HIGH` |
| `ACC_X` | `0.9317` | `HIGH` |
| `ACC_VICTIM` | `null` | `UNASSESSED` |

`ACC_VICTIM` never appears as a source, intermediary, or collector in the
detector's pattern, so it has no finding — it is unassessed, not cleared.

## What is intentionally still out of scope

- `model_mode` is not yet exposed on `/api/graph`'s `Node` — every score
  there is implicitly `rules`.
- No `/api/alerts` endpoint and no network-level `Finding` evidence is
  exposed yet — only the account-level rollup feeds into `risk_score`.
- No fallback ladder (GraphSAGE → XGBoost → rules) — `/api/graph` only ever
  runs the rules detector. See below for how XGBoost is actually exposed.
- Deduplication/update semantics for findings across re-evaluation (Stage 2
  ingestion doesn't exist yet — every request re-derives from the full
  static file, so there is nothing to deduplicate against).

## `POST /api/xgb-score` — the standalone XGBoost model, kept separate

Added 2026-09-09 at the repo owner's explicit request ("xgboost is to be
used directly"). This does **not** feed `/api/graph` or account risk in any
way — it is a second, independent endpoint that exposes `ml/xgb_baseline`'s
trained card-fraud model in its own native schema, because the model is
structurally incompatible with MuleGraph's account-graph data (see
`backend/README.md`'s "Model compatibility and failure behavior": "It cannot
be used as a drop-in scorer for this demo's sender/receiver graph... Do not
invent missing features, zero-fill incompatible inputs, mix its score with
rules").

**Request** (`backend/app/schemas.py::XgbScoreRequest`):
```json
{"time": 5000, "amount": 149.62, "v": [/* exactly 28 floats: V1..V28 */]}
```
`time`/`amount`/`v` are the OpenML dataset's own fields — not a
MuleGraph transaction. There is no `sender`/`receiver`/`account_id` because
none exists in this model's training data.

**Response**:
```json
{"score": 0.00012517257709987462, "is_fraud": false, "threshold": 0.95, "model_mode": "xgboost_card_fraud_baseline"}
```
`score` is the model's own `predict_proba` output (a genuine model output,
unlike `ml/rules`' hand-defined heuristic — see
`ml/xgb_baseline/train.py`'s `not_a_calibrated_probability_note`).
`model_mode: "xgboost_card_fraud_baseline"` is a distinct, explicit value so
it can never be confused with `ml/graph`'s implicit `rules` mode.

**Availability:** `xgboost`/`pandas`/etc. (`backend/requirements-xgb.txt`)
and the trained model bundle (`ml/models/xgb_baseline.joblib`) are optional
— imported lazily inside `backend/app/adapters/xgb_baseline.py`, not at
process startup (backend/README.md: "Keep optional ML dependencies out of
startup"). If either is missing, this endpoint alone returns `503`;
`/health` and `/api/graph` are unaffected either way — verified by starting
the service without `requirements-xgb.txt` installed and confirming
`/health`/`/api/graph` still return `200` while `/api/xgb-score` returns
`503`.

**Verified 2026-09-09:** real end-to-end inference, both natively and in
Docker — `POST /api/xgb-score` with a legitimate-looking row returns
`score: 0.000125, is_fraud: false`; malformed input (wrong `v` length,
negative `amount`, missing fields) returns `422`; the model-unavailable path
returns `503` with no stack trace. Note: installing `xgboost` pulls in
`nvidia-nccl-cu13` as a transitive dependency of its PyPI wheel (the same
wheel supports both CPU and GPU) — this is an unused shared library, not a
GPU requirement; the model itself trains and predicts with
`tree_method="hist", device="cpu"` (`ml/xgb_baseline/train.py`), and no
GPU/CUDA driver is present or needed in this image.

**Demo/test fixture:** `backend/examples/xgb_score_samples.json` — 4 real
rows from the model's held-out test split (2 known-fraud, 2 known-legit,
including one deliberately-included false negative) with both the ground
truth label and the model's own recorded prediction. `backend/tests/
test_xgb_score.py` asserts the live endpoint reproduces these exactly, and
`backend/scripts/demo_xgb_score.py` does the same against a running server
for manual demoing (`python backend/scripts/demo_xgb_score.py`). See
`backend/examples/README.md` for provenance and usage.
