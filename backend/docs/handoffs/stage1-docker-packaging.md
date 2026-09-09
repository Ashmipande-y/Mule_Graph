# Stage 1 handoff — Docker packaging

**Date:** 2026-09-09
**Scope:** containerize the existing Stage 1 static graph API (`backend/README.md` Stage 4's packaging goal, pulled forward for the current Stage 1 service only — no WebSocket work here).

## Environment inspected before implementing

- Repository instructions/`AGENTS.md`: no repo-wide agent instructions beyond the `# Agents` heading.
- Git status: only Stage 1 backend files were untracked/pending; nothing else changed.
- `backend/README.md` and `docs/api-contract.md`: reviewed for the graph/health contract and ownership boundaries (Smit owns backend/Docker; kept all changes inside `backend/`).
- FastAPI entry point: `backend/app/main.py` (`app.main:app`), deps in `backend/requirements.txt` only (`fastapi==0.141.1`, `uvicorn[standard]==0.52.4`, `pydantic==2.13.5`, `python-dotenv==1.2.3`).
- No pre-existing Docker files in the repo.
- Confirmed `ml/rules` (imported as top-level `rules` once `ml/` is on `sys.path`, see `ml/scripts/run_rules_demo.py`) is pure standard library, no dependencies — and confirmed the current `backend/app/services/graph.py` does **not** actually import it yet (Stage 1 implements its own validation). Copied it anyway per the packaging brief, for path-compatibility with the Stage 2 adapter described in `backend/README.md`.
- Confirmed the credit-card training dataset lives at `ml/data/raw/creditcard_openml_1597.parquet` (70 MB) and is unrelated to `/api/graph`.
- Docker CLI: `docker --version` → 29.7.2. Compose: `docker compose version` → v5.5.0. Engine: initially unreachable (`open //./pipe/dockerDesktopLinuxEngine`); asked the user to start Docker Desktop before proceeding, per instructions not to start system software myself. Confirmed reachable via `docker info` after the user started it.
- Port 8000 was free on the host before this work (`netstat -ano | grep :8000` → no listener) — no alternate port was needed.

## Files changed

- `backend/Dockerfile` — new. `python:3.14-slim` base (matches the exact interpreter minor version already verified for this project's dependency set — `cp314` wheels for `pydantic-core`/`httptools`/`uvloop`/`watchfiles`/`websockets`/`pyyaml` all resolved from PyPI without a source build). Installs only `backend/requirements.txt` (not `-dev`). Copies `backend/app`, `data/demo_transactions.json`, `ml/rules` at their repo-relative paths so `backend/app/config.py`'s path resolution (`REPO_ROOT = BACKEND_DIR.parent`) resolves correctly unchanged. Runs as non-root `appuser` (uid/gid 10001). Starts `python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000`.
- `backend/Dockerfile.dockerignore` — new. Allowlist strategy (`*` then explicit `!` re-includes) so anything added to the repo later is excluded by default rather than by omission. Explicitly excludes `**/*.parquet`, `**/*.joblib`, `.git`, `**/node_modules`, `**/.env`, both venvs, and pycache.
- `backend/compose.yaml` — new. `build.context: ..` (repo root) + `build.dockerfile: backend/Dockerfile`; publishes `127.0.0.1:8000:8000`; sets `CORS_ORIGINS=http://localhost:3000` and `LOG_LEVEL=INFO`; a `python -c urllib.request` healthcheck against `/health` (no curl in the slim image); no database service (Stage 3 PostgreSQL is not implemented, so none was added, per the "do not add new database functionality" instruction).
- `backend/README.md` — added a "Docker (Stage 1 image)" section with the exact verified commands, and updated the top status block.

## Exact commands run and actual results

```powershell
docker compose -f backend/compose.yaml config
```
→ Rendered cleanly: context resolved to the repo root, dockerfile `backend/Dockerfile`, port mapping `127.0.0.1:8000->8000`, healthcheck present, no networks/volumes beyond the default.

```powershell
docker compose -f backend/compose.yaml up --build -d
```
→ Image `backend-backend:latest` built successfully (259 MB). Container `backend-backend-1` created and started.

```powershell
docker compose -f backend/compose.yaml ps
```
→ `Up ... (healthy)`, `127.0.0.1:8000->8000/tcp`.

```powershell
docker compose -f backend/compose.yaml logs --tail=100
```
→ `Application startup complete.` / `Uvicorn running on http://0.0.0.0:8000` — no tracebacks, no unresolved errors, at any point across build, start, or restart.

Live verification (via `curl`, equivalent to `Invoke-RestMethod`):

- `GET /health` → `200 {"status":"ok"}`.
- `GET /api/graph` → `200`; response parsed and compared programmatically to `data/graph.example.json` — **exact match** (6 nodes, 7 edges; IDs, sender/receiver→source/target, amounts, timestamps, sort order, and `risk_score: null` / `risk_level: "UNASSESSED"` all agree with the current shared contract in `docs/api-contract.md`).
- `GET /docs` → `200` (Swagger UI enabled by default; no `docs_url` override in `app/main.py`).
- CORS: `Origin: http://localhost:3000` → response includes `access-control-allow-origin: http://localhost:3000`. `Origin: http://evil.example` → header absent, as required.
- Filesystem check inside the running container (`docker compose exec backend sh -c "find /app ..."` and a repo-wide search for `.venv`/`.git`/`node_modules`/`*.parquet`): confirmed present are exactly `backend/app/**`, `data/demo_transactions.json`, `ml/rules/**`; confirmed absent are all training/dev artifacts and VCS metadata. `whoami` inside the container → `appuser` (non-root).
- Restart: `docker compose -f backend/compose.yaml restart backend` → clean shutdown/startup log sequence, container returns to `healthy`, and `/api/graph` output after restart is byte-for-byte identical to before (expected: this stage has no mutable runtime state — everything is recomputed from the image's baked-in JSON file on each request; this will need re-verification once Stage 2 in-memory ingestion state exists).

## Contract/scope decisions made

- Build context is the repo root, not `backend/`, because the image needs `data/demo_transactions.json` and `ml/rules` — both outside `backend/`. This is an exception to "keep changes inside `backend/`" made necessary by the packaging brief itself (three new files were added, all inside `backend/`: `Dockerfile`, `compose.yaml`, `Dockerfile.dockerignore`); no files outside `backend/` were modified.
- `ml/rules` is copied into the image but is not wired into any endpoint — Stage 1's `/api/graph` still uses its own converter in `app/services/graph.py`, unchanged. This avoids silently expanding Stage 1's behavior while still satisfying the packaging instruction to make the rules modules available at their expected import path for a future adapter.
- No PostgreSQL service was added — Stage 3 persistence is not implemented in this backend, so adding a `postgres` service to `compose.yaml` would be new, unimplemented-behind functionality, which the brief explicitly said not to do.
- `requirements-dev.txt` (pytest/httpx) is intentionally **not** installed in the image — it's a test-time dependency, not a runtime one.

## Remaining / not completed

- Frontend-against-Docker integration (Adnan pointing Next.js at the containerized backend) has not been performed — out of scope for this backend-only verification pass.
- No alternate-port fallback was exercised end-to-end (port 8000 was free throughout this session); the documented `netstat -ano | findstr :8000` + alternate published-port approach in `backend/README.md` has not itself been run against a real conflict.
- Image was not scanned for vulnerabilities (e.g. `docker scout`) — not requested, and no image was published to a registry (not requested, and would require registry credentials this session doesn't have).

## Next owner's action

- Adnan: point the Next.js dev server at `http://127.0.0.1:8000` (same contract as the native run) and confirm the dashboard renders identically whether the backend is native or containerized.
- Smit: when Stage 2 ingestion lands, revisit the restart-state note above and decide whether compose needs a named volume for in-memory-store persistence expectations (it should not — in-memory means non-persistent by design — but confirm this is documented for the team).
