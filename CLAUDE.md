# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

MuleGraph: a fraud-operations demo that visualizes how funds move through a
possible mule-account network. Three independently-owned pieces:

- `backend/` — FastAPI service (owner: Smit). Serves the transaction graph and,
  separately, a standalone XGBoost scoring endpoint.
- `ml/` — detection logic (owner: Jatin). A dependency-free rules/replay engine
  plus a standalone XGBoost baseline. Imported by the backend, never copied
  into it.
- `frontend/` — Next.js UI (owner: Adnan). **Currently an empty placeholder**
  (`frontend/.gitkeep` only) — nothing has been built here yet.

Root-level `data/demo_transactions.json` is the single runtime source of
truth for the canonical six-account / seven-transaction demo scenario
(fan-out from `ACC_VICTIM` through `ACC_A` into `ACC_B`/`ACC_C`/`ACC_D`,
converging on `ACC_X`). `data/graph.example.json` is a frontend-development
reference only — never served by the backend directly.

Ownership boundaries matter here: `backend/` changes stay backend-owned;
changes to root fixtures, `ml/`, or the shared API contract
(`docs/api-contract.md`, `backend/docs/integration-contract.md`) should be
coordinated rather than made unilaterally, per `backend/README.md`'s
"Ownership boundaries" section.

## Commands

### Backend (FastAPI) — run from repo root, needs its own venv

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env   # only if backend/.env doesn't already exist
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Live checks against a running server:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/health"
Invoke-RestMethod "http://127.0.0.1:8000/api/graph" | ConvertTo-Json -Depth 10
```

Backend tests (pytest is configured via `backend/pytest.ini`: `pythonpath = .`, `testpaths = tests`):

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_graph.py -q      # single file
backend/.venv/Scripts/python.exe -m pytest backend/tests -k test_name -q      # single test
```

`/api/xgb-score` needs the optional stack from `backend/requirements-xgb.txt`
(xgboost/pandas/etc., matching `ml/requirements.txt` exactly) plus a trained
model file at `ml/models/xgb_baseline.joblib`. It's imported lazily on first
call — `/health` and `/api/graph` work fine without it installed.

Docker (Stage 1 image; build context must be the **repo root**, not
`backend/`, because the image needs `data/` and `ml/` alongside `backend/`):

```powershell
docker compose -f backend/compose.yaml up --build -d
docker compose -f backend/compose.yaml ps
docker compose -f backend/compose.yaml logs -f
docker compose -f backend/compose.yaml down
```

### ML (`ml/rules` — stdlib only, system Python, no venv needed)

```powershell
python ml/scripts/run_rules_demo.py
python -m unittest discover -s ml/tests -t ml
```

### ML (`ml/xgb_baseline` — needs its own venv)

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
ml/.venv/Scripts/python.exe ml/scripts/run_xgb_baseline.py
ml/.venv/Scripts/python.exe -m unittest discover -s ml/xgb_baseline/tests -t ml
```

### Shared fixture validation (repo root, stdlib only)

```powershell
python scripts/validate_demo.py
```

Checks that `data/demo_transactions.json` and `data/graph.example.json` are
internally consistent and agree with each other. Supports
`--transactions`/`--graph` to point at alternate fixture paths. Run this
before trusting either fixture file.

## Architecture

### Request flow for `GET /api/graph`

```
data/demo_transactions.json
  -> app/services/graph.py: _load_json -> _validate_transactions (re-validates independently of ml/rules)
  -> app/adapters/ml_rules.py: assess_accounts()
       -> ensures ml/ is on sys.path (app/adapters/_ml_path.py)
       -> rules.transactions.Transaction.from_dict (re-parses into the ml/rules type)
       -> rules.replay.evaluate_at(transactions, as_of=max(timestamp in set))  # full-fixture case, not a Stage-2 bypass
       -> rules.account_risk.account_risk_from_findings(findings) -> {account_id: AccountRisk}
  -> _build_graph(): merges account risk onto nodes, builds edges 1:1 from transactions
  -> GraphResponse{nodes, edges}
```

Key points for anyone touching this path:

- The transaction file is read and re-validated on **every** request (no
  caching) — this is intentional for the current stage, not an oversight.
- `app/services/graph.py` has its own independent validation of the raw JSON
  (positive-integer amounts, non-boolean, exact `YYYY-MM-DDTHH:MM:SSZ`
  timestamps, no duplicate IDs) — it does not rely on `ml/rules`' loader for
  correctness, and only hands already-validated records to the ML adapter.
- The detector runs against the **entire** transaction set every time — there
  is no Stage 2 ingestion/replay endpoint yet, so `evaluate_at` is always
  called with `as_of` = the latest timestamp present, which is equivalent to
  "no filtering" for a static snapshot (nothing in the file is after its own
  last timestamp).
- An account absent from every finding gets `risk_score: null` /
  `risk_level: "UNASSESSED"` — never a zero/"safe" score. This distinction
  (absence of evidence ≠ evidence of absence) is enforced in
  `app/services/graph.py::_build_graph` and repeated throughout `ml/rules`.
- Display labels (`ACC_VICTIM` -> `Victim`, etc., in `CANONICAL_LABELS`) are
  demo-authoring text only. They must never influence detection or be treated
  as model features — `ml/rules/detector.py` is deliberately account-id-agnostic.

### The ML/backend boundary (important — don't blur this)

- `backend/app/adapters/ml_rules.py` and `backend/app/adapters/xgb_baseline.py`
  are the *only* places allowed to import from `ml/`. Both route through
  `backend/app/adapters/_ml_path.py::ensure_ml_on_path()`, the single place
  that puts `ml/` on `sys.path`. Do not add another path-mutation site or copy
  ML code into `backend/`.
- `ml/rules` and `ml/xgb_baseline` are two **structurally unrelated**
  detectors, deliberately kept apart:
  - `ml/rules` — a hand-defined, stdlib-only fan-out/convergence heuristic
    over MuleGraph's own sender/receiver/amount/timestamp schema. Its `score`
    (see `detector.py`'s `_SCORE_METHOD`) is an evidence-strength ranking
    heuristic, **not** a calibrated probability. This is what actually feeds
    `/api/graph`'s risk fields.
  - `ml/xgb_baseline` — a real trained XGBoost model, but trained on the
    OpenML card-fraud dataset (`Time`, `Amount`, `V1`..`V28` PCA features) —
    it has no account/graph structure and is structurally incompatible with
    MuleGraph's data. It is exposed **only** via its own endpoint,
    `POST /api/xgb-score`, in its own native schema. It must never be wired
    into `/api/graph`, mixed with the rules score, or have its metrics
    (precision/recall/etc. from the card-fraud eval) cited as mule-detection
    performance.
- `model_mode` is not currently exposed on `/api/graph`'s nodes — every score
  there is implicitly from `ml/rules`. The intended (unimplemented) fallback
  ladder is GraphSAGE -> compatible XGBoost -> rules; GraphSAGE does not exist
  anywhere in this repo yet, and is gated on both an XGBoost baseline (done)
  and an application integration milestone (not done, since `frontend/` is
  empty).
- The LOW/MEDIUM/HIGH thresholds (`RISK_LEVEL_HIGH_THRESHOLD = 0.75`,
  `RISK_LEVEL_MEDIUM_THRESHOLD = 0.4` in `ml/rules/account_risk.py`) are a
  **provisional, unagreed** backend proposal, not a frozen contract — see
  `backend/docs/integration-contract.md` before relying on exact cut points.

### Backend layout

```
backend/app/
  main.py        # FastAPI app assembly, CORS, router registration
  config.py      # single settings loader — resolves backend/.env by file location, not CWD
  schemas.py     # all Pydantic request/response models
  api/           # thin route handlers (health, graph, xgb_score) — no business logic
  services/      # graph.py: transaction validation + graph construction
  adapters/      # the only code allowed to import from ml/
```

Config is resolved explicitly (`app/config.py`): `backend/.env` is located
relative to the module's own file path, never assumed to exist, and never
depends on the process's working directory. `DEMO_TRANSACTIONS_PATH`,
`CORS_ORIGINS`, and `LOG_LEVEL` are the only settings currently wired up
(`STORAGE_MODE`, `DATABASE_URL`, `MODEL_MODE`, etc. are targets for later
stages per `backend/README.md`, not implemented).

### ML layout

```
ml/rules/
  transactions.py   # Transaction dataclass, from_dict parsing, dedup-by-id
  detector.py        # detect_fan_out_convergence — the actual pattern detector
  replay.py           # evaluate_at / observable_transactions — no-future-leakage guarantee
  account_risk.py    # rolls network-level Findings up into per-account AccountRisk
ml/xgb_baseline/
  dataset.py, features.py, train.py, evaluate.py, inference.py   # standalone card-fraud pipeline
```

`ml/rules` has zero third-party dependencies by design — it must keep passing
`python -m unittest discover -s ml/tests -t ml` on a system Python with no
`xgboost`/`torch` installed at all. Don't add a dependency here without
strong reason.

`Finding` (network-level, from `detector.py`) and `AccountRisk` (account-level
rollup, from `account_risk.py`) are intentionally distinct shapes — a Finding
describes one pattern across several accounts; an AccountRisk is one
account's exposure across all Findings it appears in. Don't collapse them.

### Backend-facing ML entry points (documented contract, from `backend/README.md`)

| Symbol | Use |
| --- | --- |
| `rules.transactions.Transaction.from_dict(record)` | Convert a validated record into the ML transaction type |
| `rules.replay.observable_transactions(transactions, as_of)` | Time-bounded snapshot |
| `rules.replay.evaluate_at(transactions, as_of, config=None)` | Detect findings without reading future transactions |
| `rules.account_risk.account_risk_from_findings(findings)` | Derive account-level exposure |
| `Finding.to_dict()` / `AccountRisk.to_dict()` | Serialize evidence shapes |

Reinspect these signatures before wiring new backend code to them — ML work
may continue independently of the backend.

## Where things stand (avoid re-deriving this from scratch)

The staged plan in `backend/README.md` is the authoritative long-form spec.
Current reality, distilled:

- **Done and verified:** `GET /health`, `GET /api/graph` (with `ml/rules` risk
  populated — a deliberate, documented deviation from the original "keep
  risk null in Stage 1" plan), `POST /api/xgb-score`, the Stage 1 Docker
  image. `ml/rules` and `ml/xgb_baseline` are both complete and independently
  tested.
- **Not started:** the actual Next.js frontend (`frontend/` is empty), Stage 2
  ingestion/replay/`/api/alerts`, PostgreSQL, WebSocket, the explanation hook,
  and GraphSAGE.
- Detailed stage-by-stage records live in `backend/docs/handoffs/*.md` and
  `ml/docs/handoffs/*.md` — read the relevant one before assuming a stage's
  status; the READMEs are snapshots, the handoffs have exact commands/results.
- `backend/docs/integration-contract.md` is the current source of truth for
  exactly how `/api/graph` risk fields are derived and what's still
  unreviewed/out of scope — check it before changing risk-related code.

## Conventions to preserve

- Timestamps everywhere are full UTC ISO 8601, second precision, ending in
  `Z` (`YYYY-MM-DDTHH:MM:SSZ`) — no fractional seconds, real calendar dates
  only. Both `app/services/graph.py` and `ml/rules/transactions.py` parse
  with this exact format.
- Amounts are positive integers (INR for the demo fixture). Booleans must be
  explicitly rejected everywhere an amount is parsed (`bool` is a subclass of
  `int` in Python) — every parser in this repo does this on purpose.
- Duplicate transaction IDs are a hard error in `app/services/graph.py`
  (rejected, not silently dropped) but silently deduplicated
  (first-occurrence-wins) inside `ml/rules` — these are different layers with
  different jobs: the backend guards data integrity at ingestion, `ml/rules`
  guards against duplicate input inflating detection evidence.
- Nodes are sorted by `id`; edges are sorted by `(timestamp, id)`. Repeated
  transfers between the same account pair are never collapsed into one edge —
  each transaction is separate evidence.
