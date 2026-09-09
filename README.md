# MuleGraph

A fraud-operations demo that visualizes how funds move through a possible
mule-account network: a deterministic fan-out/convergence detector
(`ml/rules`), a real FastAPI backend, and a Next.js analyst console with
five investigation layouts. Two optional, separately-documented extensions
sit alongside the canonical demo — a standalone card-fraud XGBoost model
(`ml/xgb_baseline`) and a full IBM synthetic AML transfer-network
integration (`ml/aml_baseline`, `/aml`) — neither is required for the
canonical demo to run.

For the full architecture, data model, and API reference, see
[`PLAYBOOK.md`](./PLAYBOOK.md). This file is a quickstart.

## Quickstart: Docker (recommended)

From the repository root:

```powershell
docker compose up --build -d
```

This builds and runs **one container** (FastAPI backend on `:8000` + Next.js
frontend on `:3000`, supervised by `docker-entrypoint.sh`) from a fresh
checkout — no dataset download or model training required first. Open
[http://localhost:3000](http://localhost:3000) for the UI,
[http://localhost:8000/docs](http://localhost:8000/docs) for the interactive
API docs.

```powershell
docker compose ps            # status / health
docker compose logs -f       # follow combined logs
docker compose down          # stop and remove
```

**What works out of the box:** the canonical 6-account demo (`/api/graph`),
transaction entry and risk assessment (`POST /api/assess`), and every
frontend layout. **What doesn't, until you supply it:** `POST /api/xgb-score`
and everything under `/api/aml/*` — both return a clear error (not a crash,
not a silent fallback) naming exactly which local artifact is missing. See
"Optional: the IBM AML dataset" below to enable AML support, and
`ml/models/README.md` for the XGBoost card-fraud model.

To make the container refuse to start unless the AML dataset and model are
already prepared (rather than degrading gracefully), set `AML_MODE=required`:

```powershell
AML_MODE=required docker compose up --build -d
```

## Quickstart: without Docker

**Backend** (terminal 1):

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

**Frontend** (terminal 2):

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional: the IBM AML dataset

`/aml` and `/api/aml/*` need two local, gitignored artifacts this project
never downloads or trains automatically:

1. **The prepared dataset** — obtain IBM's source file yourself (Kaggle
   account required; see [`data/aml/README.md`](./data/aml/README.md)), then:
   ```powershell
   ml/.venv/Scripts/python.exe scripts/prepare_aml_dataset.py --source /path/to/HI-Small_Trans.csv
   ```
2. **The trained classifier** — after step 1:
   ```powershell
   ml/.venv/Scripts/python.exe ml/scripts/run_aml_baseline.py
   ```

See [`ml/aml_baseline/README.md`](./ml/aml_baseline/README.md) and
[`ml/models/README.md`](./ml/models/README.md) (model versions and
checksums) for full detail.

## Testing

```powershell
python scripts/validate_demo.py                                              # canonical fixture consistency
backend/.venv/Scripts/python.exe -m pytest backend/tests -q                  # backend (self-skips AML/xgb tests if artifacts absent)
python -m unittest discover -s ml/tests -t ml                                # ml/rules (stdlib only)
ml/.venv/Scripts/python.exe -m unittest discover -s ml/xgb_baseline/tests -t ml   # self-skips if raw dataset/model absent
ml/.venv/Scripts/python.exe -m unittest discover -s ml/aml_baseline/tests -t ml   # self-skips if dataset/model absent
cd frontend && npm test && npx tsc --noEmit && npm run lint && npm run build
cd frontend && npx playwright test                                           # browser integration tests (spins up its own isolated backend+frontend)
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR,
reporting artifact-dependent skips explicitly rather than failing or
silently passing.

## Ownership

- **Backend & data pipeline:** `backend/`, `data/`
- **Machine learning & detection:** `ml/`
- **Frontend & visual analytics:** `frontend/`
- **Integration & governance:** `docs/`, root-level contracts (this file,
  `PLAYBOOK.md`, `AGENTS.md`)

Cross-cutting changes (shared API contracts, root fixtures, `ml/`) should be
coordinated across owners rather than made unilaterally — see each
component's own `README.md`.
