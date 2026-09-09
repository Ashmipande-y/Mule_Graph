# MuleGraph Backend

**Owner:** Smit Kapadia — Backend and Data Lead  
**Integration:** Ashmi Pandey  
**ML interface:** Jatin Bisht  
**Frontend consumer:** Adnan Jukkerwala

## Status and purpose

This README is the backend implementation brief and target operating guide.

**Update (2026-09-09):** Stage 1 (the static graph API: `GET /health` and `GET /api/graph`) is implemented and verified — see `backend/docs/handoffs/stage1-static-graph-api.md` for the exact commands run and results. The frontend integration half of the Stage 1 gate is still pending Adnan's confirmation. It also runs in Docker — see `backend/docs/handoffs/stage1-docker-packaging.md` and the "Docker (Stage 1 image)" section below.

**Update (2026-09-09, later same day):** at the repo owner's explicit request, `/api/graph`'s `risk_score`/`risk_level` node fields are now populated by actually running the existing `ml/rules` fan-out/convergence detector against the full transaction set on every request (`backend/app/adapters/ml_rules.py`). **This deviates from this document's original Stage 1 instruction ("Do not run the detector during static graph conversion")** and has not been reviewed by Jatin or Ashmi — see `backend/docs/integration-contract.md` for exactly what changed, the proposed (unagreed) risk-level thresholds, and what's still out of scope (no `/api/alerts`, no `model_mode`, no ingestion/replay). **Stages 2 and later otherwise (ingestion/replay endpoints, PostgreSQL, WebSocket, explanation hook) remain implementation targets, not functionality verified by this document.**

The supplied ML README reports the data foundation, rules/replay engine, and standalone XGBoost baseline complete. Their integration with FastAPI is not implemented or agreed yet. GraphSAGE is not implemented.

MuleGraph helps a fraud operations analyst inspect how funds move through a possible mule-account network. The backend connects transactions, graph state, detection evidence, alerts, and explanations while preserving consistent IDs.

The first deliverable is:

```text
data/demo_transactions.json
            |
            v
FastAPI GET /api/graph
            |
            v
Next.js + react-force-graph-2d
            |
            v
Six accounts and seven directed transfers visible in the dashboard
```

The later demo path is:

```text
Transaction replay -> validated ingestion -> graph snapshot
    -> rules adapter -> risk/evidence -> alert -> frontend highlight
    -> evidence-only explanation
```

## Source alignment and scope

This brief uses the **MuleGraph Project Team Playbook**, particularly pages 9, 12–15, 18, 20–22, and 25, the supplied ML README, the local `docs/api-contract.md`, and the inspected ML rules interfaces.

The playbook describes the intended complete system and hackathon checkpoints. It does not prove that a component exists. Its illustrative scores and diagrams are not runtime fixtures or measured results. Follow the current shared transaction fixture rather than recreating amounts from illustrative playbook diagrams.

The playbook includes GraphSAGE in the desired build; the current user-directed progression still requires the static application flow and working baselines before GraphSAGE work. The backend must remain usable when enhanced models are unavailable.

### Ownership boundaries

- Smit owns FastAPI, validation, runtime transaction storage, application replay, the backend ML adapter, PostgreSQL, WebSocket delivery, and backend launch tooling.
- Jatin owns detection algorithms, features, models, and their evaluation. Import the existing rules; do not copy or retrain them inside the backend.
- Adnan owns the Next.js UI. Do not edit frontend code to make a backend test pass.
- Ashmi coordinates shared contracts, explanations, integration gates, and demo freeze.
- Keep backend implementation, tests, dependencies, migrations, Docker files, and handoffs under `backend/` by default. Coordinate changes to root files, `ml/`, shared fixtures, or the shared contract with the affected owner.
- Inspect project instructions and Git status before editing. Preserve existing work. Do not publish, force-push, or change global settings as part of routine implementation.

## Technology and dependency policy

- Python and FastAPI, with Uvicorn for local serving.
- Explicit request/response models and strict validation.
- JSON-backed static data first; an in-memory runtime store for the first replay slice.
- PostgreSQL for the later persistence stage.
- REST first, polling fallback, then WebSocket.
- Docker after native startup works; Docker is not required for the first graph demo.

Use a backend-local virtual environment. Select compatible versions from the actual installed interpreters and current official package documentation; pin the dependency set that passes verification. The current machine's ML environment is separate from the backend environment.

The initial service and rules path must not require XGBoost, torch, PyTorch Geometric, CUDA, a paid AI API, PostgreSQL, or internet access at runtime.

## Suggested repository layout

Create only the files needed for the active stage. Later paths in this tree are targets, not existing files.

```text
backend/
├── README.md
├── .env.example
├── .gitignore
├── requirements.txt
├── requirements-dev.txt
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── schemas.py
│   ├── api/
│   │   ├── health.py
│   │   ├── graph.py
│   │   └── ...                 # later endpoints as their stages start
│   ├── services/
│   │   ├── graph.py
│   │   ├── transactions.py
│   │   ├── replay.py
│   │   └── alerts.py
│   ├── adapters/
│   │   └── ml_rules.py
│   └── storage/
│       ├── memory.py
│       └── postgres.py
├── tests/
├── scripts/
├── migrations/                 # PostgreSQL stage
├── docs/
│   ├── integration-contract.md
│   └── handoffs/
├── Dockerfile                  # packaging stage
└── compose.yaml                # packaging stage
```

## Stage 1 — Static graph API

Implement only `GET /health` and `GET /api/graph` first.

### Health

`GET /health` returns HTTP 200:

```json
{"status": "ok"}
```

Preserve this shared response. A successful health request establishes process availability; it does not prove the graph source or later models are healthy.

### Canonical source

`data/demo_transactions.json` is the runtime source of truth. `data/graph.example.json` is a frontend development/reference fixture, not the backend's runtime graph response.

Each transaction has exactly these fields:

```json
{
  "id": "TX_001",
  "sender": "ACC_VICTIM",
  "receiver": "ACC_A",
  "amount": 50000,
  "timestamp": "2026-01-01T10:00:00Z"
}
```

The canonical seven transfers are:

| ID | UTC time on 2026-01-01 | Sender | Receiver | INR |
| --- | --- | --- | --- | ---: |
| TX_001 | 10:00:00 | ACC_VICTIM | ACC_A | 50000 |
| TX_002 | 10:00:04 | ACC_A | ACC_B | 15000 |
| TX_003 | 10:00:07 | ACC_A | ACC_C | 14000 |
| TX_004 | 10:00:10 | ACC_A | ACC_D | 16000 |
| TX_005 | 10:00:15 | ACC_B | ACC_X | 13000 |
| TX_006 | 10:00:18 | ACC_C | ACC_X | 12000 |
| TX_007 | 10:00:21 | ACC_D | ACC_X | 14000 |

Amounts are positive integer INR values for this demo. Reject booleans, zero, negative values, fractional amounts, and implicit string-to-number coercion. Validate nonempty IDs and full UTC timestamps of the form `YYYY-MM-DDTHH:MM:SSZ`, including real calendar dates.

### Graph response

`GET /api/graph` returns an object with `nodes` and `edges` arrays. The following is a small shape illustration, not the full canonical response:

```json
{
  "nodes": [
    {"id": "ACC_A", "label": "Account A", "risk_score": null, "risk_level": "UNASSESSED"},
    {"id": "ACC_VICTIM", "label": "Victim", "risk_score": null, "risk_level": "UNASSESSED"}
  ],
  "edges": [
    {"id": "TX_001", "source": "ACC_VICTIM", "target": "ACC_A", "amount": 50000, "timestamp": "2026-01-01T10:00:00Z"}
  ]
}
```

For the actual fixture, return all six nodes and seven edges. Deduplicate account nodes, preserve each transaction as a separate directed edge, and sort nodes by ID and edges by `(timestamp, id)`. Do not collapse repeated transfers between the same accounts.

Canonical labels: ACC_VICTIM = Victim; ACC_A/B/C/D = Account A/B/C/D; ACC_X = Collector X. For other IDs, use the ID as the label until account metadata exists. Display labels must never influence detection.

Keep every score null and every risk level UNASSESSED in this stage. Do not run the detector during static graph conversion. **(Deviated 2026-09-09 at the repo owner's explicit request — see the status update at the top of this file and `backend/docs/integration-contract.md`. The instruction on this line is the original Stage 1 design intent; treat the deviation as provisional pending Jatin/Ashmi review, not a reversal of this guidance.)**

Read and validate the transaction file for each static graph request in this small demo. Resolve default paths relative to the application/repository location, independent of the shell's current directory. Configure CORS for the local frontend origin `http://localhost:3000` with an environment override.

### Errors and empty data

- A valid empty transaction array returns HTTP 200 with `{"nodes":[],"edges":[]}`.
- Missing or malformed server-side source data returns HTTP 500 with a clear JSON `detail` and useful server logging. Do not expose stack traces or secrets in responses.
- Reject duplicate IDs in the static source rather than silently dropping canonical evidence.
- Do not substitute the reference graph after a data error.
- The canonical fixture validator requires exactly the authored demo; the general graph converter must also handle valid noncanonical and empty inputs.

### Stage 1 acceptance gate

- [x] Shared fixture validator passes (`python scripts/validate_demo.py`, run before this backend work; unchanged by it).
- [x] Health and graph requests succeed against a running service (verified with live `Invoke-RestMethod`-equivalent calls; see handoff).
- [x] The graph exactly matches the canonical reference after parsing JSON.
- [x] Converter tests cover repeated account pairs, arbitrary account IDs, empty data, malformed records, invalid amounts/timestamps, duplicate IDs, and missing files (`backend/tests/test_graph.py`).
- [x] Tests cover paths independent of the working directory and CORS behavior.
- [ ] Adnan confirms that Next.js displays the actual API response and supports account/transaction inspection. **Pending — not yet performed.**
- [ ] Stopping the backend makes frontend Reload show an error; restarting it allows recovery. **Backend half verified (connection fails once stopped); frontend Reload behavior not yet checked by Adnan.**

Backend tests alone do not close the frontend/backend integration gate. Record any pending external check rather than marking it passed.

## Stage 2 — Ingestion, deterministic replay, and rules adapter

Start this stage after the static vertical slice is verified. Keep the shared fixture read-only: runtime ingestion updates a separate in-memory store, later replaced by PostgreSQL.

### Proposed additional endpoints

These routes follow the master project direction but their detailed payloads must be agreed with Ashmi, Jatin, and Adnan before integration:

| Endpoint | Purpose | Stage |
| --- | --- | --- |
| `POST /api/transactions` | Validate and ingest one transfer | 2 |
| `GET /api/accounts/{id}` | Account context and related transfers | 2 |
| `GET /api/risk/{id}` | Account assessment with method and evidence | 2 |
| `GET /api/alerts` | Network findings for analyst review | 2 |
| `WS /ws/transactions` | Committed transaction/risk/alert updates | 4 |
| `POST /api/explain/{alert_id}` | Evidence-based narrative via Ashmi's component | 5 |

Do not invent a new endpoint simply to expose an internal helper. Initial replay may be a backend-local CLI that feeds the normal ingestion path; document reset/seed commands rather than exposing an unrestricted reset API.

### Ingestion and replay behavior

- New valid transaction: persist/store once, evaluate the affected snapshot, update risk/alerts, then publish committed state.
- Exact repeated ID and identical canonical payload: idempotent success, no duplicate edge, alert, or event.
- Reused ID with different payload: HTTP 409. Invalid request shape or values: HTTP 422. Unknown account/alert lookup: HTTP 404.
- Sort replay by event timestamp, then ID. Use explicit UTC evaluation time and an adjustable wall-clock delay that does not change event timestamps.
- Initialize replay state empty; do not preload future edges, accounts, risk, or findings into early snapshots. Static full-fixture mode and replay mode must be explicit.
- Prevent simultaneous replay runs from mixing state. Keep reads internally consistent with ingestion and evaluation; one in-memory worker is sufficient for the local demo.
- Replaying after a documented reset should reproduce the same logical graph and findings. Keep stable evidence-based alert identity; put run identity in a separate field if needed.

### Verified existing ML entry points

The local rules modules expose these functions. Reinspect signatures before wiring them because ML work may continue:

| Existing symbol | Backend use |
| --- | --- |
| `rules.transactions.Transaction.from_dict(record)` | Convert a validated record into the ML transaction type |
| `rules.replay.observable_transactions(transactions, as_of)` | Build a time-bounded graph snapshot |
| `rules.replay.evaluate_at(transactions, as_of, config=None)` | Detect findings without reading future transactions |
| `rules.account_risk.account_risk_from_findings(findings)` | Derive account-level exposure from network findings |
| `Finding.to_dict()` / `AccountRisk.to_dict()` | Serialize existing evidence shapes |

These imports currently require the repository's `ml/` directory to be on the Python module path. Keep that setup explicit in one adapter/launch configuration, independent of the working directory. Do not scatter path mutations across endpoints or copy the ML package into the backend. Coordinate installable packaging with Jatin if needed.

Use `evaluate_at` for replay. Calling the detector on the full future fixture and later hiding edges in the UI is not valid time-bounded evaluation.

**Duplicate handling:** the inspected ML loader/deduplicator keeps the first occurrence of an ID. It does not reject a later conflicting payload. The backend must enforce identical-retry versus conflicting-ID behavior before handing records to ML; importing the loader alone is insufficient ingestion validation.

### Risk, findings, and alerts

The playbook's intended risk fields are `account_id`, `risk_score`, `risk_level`, `pattern`, `signals`, `timestamp`, with `model_mode` identifying the active method. This is an integration target, not an existing agreed `infer(subgraph)` implementation.

The current account record contains `account_id`, `roles`, `max_score`, `finding_count`, `evidence_transaction_ids`, and `score_is_not_a_probability`. The network finding contains source, collector, intermediaries, transaction evidence, time window, score, score method, and evidence. Keep both concepts distinct.

Propose and document the mapping in `backend/docs/integration-contract.md`:

- `risk_score` derives from account aggregation, not blindly copying a network finding onto every graph node.
- Preserve heuristic score meaning and method metadata. Define risk-level thresholds with Jatin and Ashmi; there are no frozen LOW/MEDIUM/HIGH thresholds in the static contract.
- Accounts absent from a finding must not be declared proven safe; define and document their assessed/unassessed state.
- Alerts identify the network and contributing transactions. Each intermediary's account evidence must contain its own transfers, not every transfer in the network.
- Distinguish event/evaluation time from wall-clock creation time.
- Preserve ML pattern identifiers or explicitly document any frontend mapping. Do not silently rename enum values.
- Deduplicate findings across polling/re-evaluation and define updates when evidence changes.
- Expose model mode, availability/fallback reason, and evidence needed for ring highlighting and “Why flagged?”.

Agree the contract before changing the shared graph or alert payloads. Keep illustrative 34%/89% values out of scoring code. The rules score is an evidence-strength heuristic, not a fraud probability or an accuracy metric.

### Model compatibility and failure behavior

The supplied ML README reports an XGBoost model trained on OpenML creditcard data, with no account/graph structure. **It cannot be used as a drop-in scorer for this demo's sender/receiver graph.** Do not invent missing features, zero-fill incompatible inputs, mix its score with rules, or report its card-fraud metrics as mule-detection performance.

For the current demo, use `model_mode = rules`. Keep optional ML dependencies out of startup. An enhanced mode becomes available only when Jatin supplies a compatible feature pipeline, checkpoint, and agreed inference interface.

The intended fallback ladder is GraphSAGE -> compatible XGBoost -> rules. Skip incompatible as well as unavailable tiers. Record requested versus actual mode and the reason for fallback. A missing model is not equivalent to invalid transaction input.

Configure bounded inference execution so a stalled optional model cannot block requests or exhaust workers. A timeout must not start unlimited background inference jobs. When every valid detector is unavailable, report unavailable/unassessed risk explicitly; never fabricate a successful zero-risk result.

### Stage 2 acceptance gate

- [ ] Canonical replay shows no full fan-out/convergence finding before the convergence evidence exists.
- [ ] Final replay produces the expected network evidence using the existing rules, without hardcoded account detection logic.
- [ ] Identical retries do not inflate graph, risk, alerts, or notifications; conflicts return 409.
- [ ] No future transaction, node, or risk information leaks into earlier snapshots.
- [ ] Account evidence remains scoped correctly and alert identities remain stable across repeat evaluation.
- [ ] Rule execution works in the backend environment without XGBoost or torch installed.
- [ ] Adnan can render real risk/evidence and alerts through the agreed contract.

## Stage 3 — PostgreSQL persistence

Keep the successful in-memory demo path runnable while adding PostgreSQL behind the storage interface. Define migrations for accounts, transactions, and alerts, including risk/method metadata and evidence references appropriate to the agreed contract.

- Enforce unique transaction IDs and account references in the database.
- Store amounts as integers consistent with the demo contract and event times as timezone-aware timestamps.
- Persist accounts, accepted transactions, assessments/alerts, and evidence consistently. Publish events after a successful write.
- Make seeding idempotent. Never automatically reset a database at service startup.
- Verify restart persistence, duplicate handling, and rollback on partial failure.
- Select the storage mode explicitly at startup. If PostgreSQL fails, expose the failure; do not silently switch to a divergent memory store midway through a run. A documented restart into local demo mode is the fallback.

Database credentials belong in local environment configuration, never in tracked files or logs.

## Stage 4 — WebSocket and Docker/local packaging

Add WebSocket only after REST and replay work. Freeze the event envelope with Adnan before implementation. Include event type, event ID/sequence, evaluation timestamp, and stable transaction/account/alert IDs.

Emit only committed updates. Define initial snapshot synchronization, reconnect/resync, duplicate event handling, and cleanup of disconnected clients. A reconnect must not silently miss graph or alert state. If there is no durable event buffer, resync from REST rather than claiming lossless delivery.

Keep polling `/api/graph` and `/api/alerts` as a working fallback. A broken WebSocket connection must not stop ingestion or detection.

Provide native local launch commands first, then backend Docker/Compose files. Document the build context needed to access backend code, shared demo data, and the ML package. Do not install training frameworks merely to run the rules-based service. Do not claim Docker is verified without an actual successful launch/check.

## Stage 5 — Explanation hook and demo freeze

Coordinate `POST /api/explain/{alert_id}` with Ashmi. The backend supplies a validated evidence packet; Ashmi owns the narrative component and its cached/template fallback.

The explanation may describe why a pattern was flagged, relevant accounts, transaction evidence, and what an analyst should inspect. It must not change detection decisions, invent evidence, or declare certain fraud. Expose whether text is generated, cached, or templated. Cache against an evidence version so changed evidence does not return an obsolete narrative.

Keep explanation failures outside ingestion and detection. Missing narrative credentials must not break the local demo.

Freeze features after the complete demo survives three clean rehearsals. Record native launch steps, environment settings, actual storage/model mode, fallback steps, and known limitations in the backend handoff. Coordinate backup recording and final submission with Ashmi; these are not backend-owned deliverables.

## Configuration target

Implement and document a single explicit configuration loader. Do not assume a `.env` file loads merely because it exists. The following names are proposed conventions; coordinate any change before consumers rely on them.

| Variable | Initial target | Purpose |
| --- | --- | --- |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed frontend origins; document list syntax |
| `DEMO_TRANSACTIONS_PATH` | repo-relative `data/demo_transactions.json` | Static source; allow an absolute override |
| `LOG_LEVEL` | `INFO` | Backend logging |
| `STORAGE_MODE` | later: `memory` | Explicit runtime store selection |
| `DATABASE_URL` | unset until PostgreSQL stage | Local secret configuration |
| `MODEL_MODE` | later: `rules` | Requested compatible detection path |
| `MODEL_TIMEOUT_SECONDS` | choose and test during integration | Bound optional inference work |
| `REPLAY_DELAY_SECONDS` | choose in replay stage | Wall-clock pacing only |

Keep environment files, `.venv/`, caches, logs, and generated runtime data ignored. Commit `.env.example` with no credentials.

## Setup and verification commands

**Update (2026-09-09):** the native (non-Docker) commands below are implemented and verified — see `backend/docs/handoffs/stage1-static-graph-api.md`. The Docker commands are in their own subsection further down, also implemented and verified — see `backend/docs/handoffs/stage1-docker-packaging.md`.

Intended Windows PowerShell setup, from the repository root:

```powershell
cd "D:\MuleGraph"
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Copy the environment example only when the local file does not already exist. The configuration loader must explicitly resolve `backend/.env`. Run the server in one terminal and requests/tests in another.

Intended live API checks:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/health"
Invoke-RestMethod "http://127.0.0.1:8000/api/graph" | ConvertTo-Json -Depth 10
```

Existing ML/data checks reported by the supplied README (run again when needed; not re-executed while authoring this document):

```powershell
python scripts/validate_demo.py
python ml/scripts/run_rules_demo.py
python -m unittest discover -s ml/tests -t ml
```

Intended backend test command, once pytest and backend tests exist:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

Configure test imports explicitly. Tests should use temporary fixtures/stores and must not rewrite shared demo data or a developer's database. Backend integration tests must call the existing rules adapter, not a reimplemented test double for the entire detection path.

## Docker (Stage 1 image)

**Update (2026-09-09):** this image now packages the FastAPI app, `data/demo_transactions.json`, `ml/rules` (wired into `/api/graph`'s risk fields), and `ml/xgb_baseline` + its trained `ml/models/xgb_baseline.joblib` (wired into the separate `POST /api/xgb-score` endpoint only — see `backend/docs/integration-contract.md`). It still does **not** include `requirements-dev.txt`, torch, PyTorch Geometric, CUDA drivers, or the credit-card training Parquet file (`ml/data/raw/creditcard_openml_1597.parquet` — the training set stays out of the image on purpose; only the already-trained model bundle ships). This roughly triples the image size (~1.6 GB vs ~260 MB) because of `xgboost`/`pandas`/`numpy`/`scipy`/`pyarrow`/`scikit-learn`. Build context is the **repository root**, not `backend/`, because the image needs files from `data/` and `ml/` alongside `backend/`; see `backend/Dockerfile.dockerignore` for exactly what crosses into the build. Run every command below from `D:\MuleGraph`.

Building this image downloads several large wheels (`xgboost` alone is ~58 MB) — on a slow connection this can take several minutes; it is not stuck just because there's no output for a while (`docker compose ... build` with default progress output buffers until each step completes). The Dockerfile uses a pip BuildKit cache mount, so a second build after a small code change reuses already-downloaded packages instead of re-fetching them.

Build and start (detached):

```powershell
docker compose -f backend/compose.yaml up --build -d
```

Check status and logs:

```powershell
docker compose -f backend/compose.yaml ps
docker compose -f backend/compose.yaml logs --tail=100
docker compose -f backend/compose.yaml logs -f          # follow
```

Verify against the running container:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/health"
Invoke-RestMethod "http://127.0.0.1:8000/api/graph" | ConvertTo-Json -Depth 10
```

Restart (state is recomputed from the baked-in JSON file on every request in this stage, so a restart reproduces byte-identical output — this will change once Stage 2 in-memory ingestion state exists):

```powershell
docker compose -f backend/compose.yaml restart backend
```

Rebuild after a code change:

```powershell
docker compose -f backend/compose.yaml up --build -d
```

Shut down without deleting volumes (no named volumes exist yet in this compose file, so this only removes the container/network):

```powershell
docker compose -f backend/compose.yaml down
```

If port 8000 is already in use on the host, find the conflicting process first — do not kill it blindly:

```powershell
netstat -ano | findstr :8000
```

then either stop that specific process yourself, or run this backend on an alternate host port by overriding the published port for one run, e.g. `127.0.0.1:8001:8000`, and use that port in the checks above instead.

**Verified 2026-09-09** (Docker Desktop 29.7.2 / Compose v5.5.0 / `python:3.14-slim` base): build succeeded, container reports `healthy`, `/health` returns `{"status":"ok"}`, `/api/graph` returns real `ml/rules` risk output (see `backend/docs/integration-contract.md`) with the correct 6 nodes/7 edges, CORS allows `http://localhost:3000` and omits the allow-origin header for other origins, process runs as non-root `appuser`, and a restart reproduces identical output with a clean startup/shutdown log (no unresolved errors). `POST /api/xgb-score` returns real model inference (`200` on a valid row, `422` on malformed input). Container filesystem contains no `.venv`, `.git`, `node_modules`, or the training dataset (`ml/data/raw/*.parquet`) anywhere, and no `ml/xgb_baseline/tests/`; the only `*.parquet` files present are `pyarrow`'s own tiny bundled test fixtures (an installed dependency's internal test data, not the MuleGraph training set). Full evidence and exact commands: `backend/docs/handoffs/stage1-docker-packaging.md` and `backend/docs/handoffs/xgb-score-endpoint.md`.

`/docs` (interactive Swagger UI) is enabled by default at `http://127.0.0.1:8000/docs` since no `docs_url` override is set on the `FastAPI` app.

## Backend completion checklist

- [ ] Static graph API and frontend integration gate passed with recorded evidence.
- [ ] Replay and ingestion produce consistent graph, account risk, and alert state.
- [ ] Rules adapter and fallback/error handling verified.
- [ ] Shared frontend/ML contracts agreed and documented.
- [ ] PostgreSQL seed and restart persistence verified, or explicitly marked incomplete with a working local fallback.
- [ ] WebSocket reconnect/resync verified, or explicitly disabled with polling verified.
- [ ] Explanation hook works with the chosen generated/cached/template mode.
- [ ] Native launch verified; Docker status stated separately and honestly.
- [ ] Three complete demo runs recorded as pass/fail, with active storage and model mode.
- [ ] No credit-card metrics presented as mule-network performance and no unsupported enhanced mode claims.

For each completed stage, write `backend/docs/handoffs/<stage>.md` with changed files, exact commands, actual results, contract decisions, remaining blockers, and the next owner's action. Do not mark the complete backend done merely because the first endpoints work.

## First instruction for the backend implementer

Read this README and the current shared contract, inspect the repository, and implement **Stage 1: the static graph API**. Keep changes within backend-owned files. Run meaningful backend checks and document the live API result. If the frontend is unavailable, report the integration gate as pending; do not implement the frontend or mark the gate passed. Continue to later stages only when their prerequisites and shared contracts are satisfied.
