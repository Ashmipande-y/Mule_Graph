# Stage 1 handoff — static graph API

**Date:** 2026-09-09
**Scope:** `GET /health`, `GET /api/graph` per `backend/README.md` Stage 1 and `docs/api-contract.md`.

## Changed files

- `backend/app/main.py` — FastAPI app, CORS middleware, router wiring.
- `backend/app/config.py` — explicit config loader; resolves `backend/.env` by file location, not cwd.
- `backend/app/schemas.py` — `Node`, `Edge`, `GraphResponse`, `HealthResponse` models.
- `backend/app/services/graph.py` — reads/validates `data/demo_transactions.json` and converts it to the graph shape on every request.
- `backend/app/api/health.py`, `backend/app/api/graph.py` — route handlers.
- `backend/tests/` — 21 tests covering health, canonical-fixture match, repeated pairs, arbitrary account IDs, sort order, invalid records (missing field, bool/zero/negative/fractional/string amount, malformed/invalid-calendar timestamp, empty ID), duplicate IDs, missing file, malformed JSON, working-directory independence, and CORS allow/deny.
- `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pytest.ini`, `backend/.env.example`, `backend/.gitignore`.
- Removed `backend/.gitkeep` (directory no longer empty).

## Exact commands run

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
Invoke-RestMethod "http://127.0.0.1:8000/health"
Invoke-RestMethod "http://127.0.0.1:8000/api/graph" | ConvertTo-Json -Depth 10
```

## Actual results

- `pytest backend/tests -q` → **21 passed**.
- Live `GET /health` → `200 {"status":"ok"}`.
- Live `GET /api/graph` → `200`, byte-for-byte match (after JSON parse) against `data/graph.example.json`'s six nodes / seven edges, confirmed by direct diff of the parsed response against that fixture.
- Verified the response is independent of the process's working directory (ran a request with cwd pointed elsewhere; same result).
- Verified stopping the server causes subsequent requests to fail to connect (visible failure, no silent fixture fallback).
- Dependency versions actually installed and verified on this machine's Python 3.14.6: `fastapi==0.141.1`, `uvicorn==0.52.4` (with `[standard]` extras), `pydantic==2.13.5`, `python-dotenv==1.2.3`, `pytest==9.1.1`, `httpx==0.28.1`.

## Contract decisions made

- Any malformed static-source record (missing field, non-string/empty id or account, non-positive/boolean/fractional amount, bad timestamp, duplicate id) is treated as **HTTP 500** per `docs/api-contract.md` — this is server-side source data, not a client request, so 422 is not used here. 422 is reserved for future Stage 2 request validation on `POST /api/transactions`.
- Non-canonical account IDs display with the ID itself as the label (README/contract: "For other IDs, use the ID as the label until account metadata exists").
- The general graph converter (`app/services/graph.py`) intentionally accepts any valid transaction set, including empty and non-canonical ones — unlike `scripts/validate_demo.py`, which only accepts the exact seven-transaction canonical fixture. Both are correct; they serve different purposes.

## Remaining / pending

- **Frontend integration gate is pending** — this handoff only verifies the backend in isolation (curl/Invoke-RestMethod and pytest). Adnan still needs to confirm Next.js renders the live `/api/graph` response and that stopping the backend surfaces a visible error on Reload.
- Stage 2+ (ingestion, replay, rules adapter, PostgreSQL, WebSocket, explanation hook) not started.
- `backend/README.md`'s top status line ("only `.gitkeep`") is now stale and should be updated once this is reviewed/merged.

## Next owner's action

- Adnan: run the frontend against `http://127.0.0.1:8000/api/graph` and confirm the dashboard renders the six accounts / seven transfers, then report pass/fail for the Stage 1 frontend gate.
- Smit: review contract decisions above before Stage 2 work begins.
