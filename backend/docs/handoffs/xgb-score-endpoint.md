# Handoff — `POST /api/xgb-score`, connecting `ml/xgb_baseline` to the backend

**Date:** 2026-09-09
**Scope:** wire the standalone `ml/xgb_baseline` model into the backend, at the repo owner's explicit request ("xgboost is to be used directly"), and package it into the Docker image.

## Why a new endpoint instead of `/api/graph`

`ml/xgb_baseline` is trained on OpenML dataset 1597 — anonymized card-present
transactions with schema `Time, V1..V28, Amount, Class`. There is no
`sender`/`receiver`/`account_id` in that data, and no way to derive
`V1..V28` (PCA-transformed, undisclosed original meaning) from MuleGraph's
`id, sender, receiver, amount, timestamp` transactions. `backend/README.md`
explicitly forbids papering over this: "Do not invent missing features,
zero-fill incompatible inputs, mix its score with rules, or report its
card-fraud metrics as mule-detection performance." So this was wired in as
its own endpoint, in the model's own native schema, never touching
`/api/graph` or account risk. Full rationale and exact contract:
`backend/docs/integration-contract.md`.

## Files changed

- `backend/app/adapters/_ml_path.py` — new. Extracted the `ml/` →
  `sys.path` wiring out of `ml_rules.py` into a shared helper so both
  adapters use the same one place (per backend/README.md's Stage 2 note).
- `backend/app/adapters/ml_rules.py` — updated to use the shared helper (no
  behavior change).
- `backend/app/adapters/xgb_baseline.py` — new. Loads `ml/xgb_baseline`'s
  trained model lazily (first request, not process startup — see its
  docstring) and scores one row via `xgb_baseline.inference.predict`.
- `backend/app/schemas.py` — added `XgbScoreRequest` (`time`, `amount`, `v`:
  exactly 28 floats) and `XgbScoreResponse` (`score`, `is_fraud`,
  `threshold`, `model_mode: "xgboost_card_fraud_baseline"`).
- `backend/app/api/xgb_score.py` — new. `POST /api/xgb-score`; converts
  `XgbUnavailableError` (deps or model file missing) to `503`.
- `backend/app/main.py` — registered the new router.
- `backend/requirements-xgb.txt` — new. Superset of `requirements.txt` +
  `xgboost==3.4.1`, `pandas==3.0.5`, `numpy==2.5.3`, `scipy==1.18.1`,
  `pyarrow==25.0.1`, `scikit-learn==1.9.0`, `joblib==1.6.0` (exact versions
  matching `ml/requirements.txt`, the environment the model was actually
  trained/verified in).
- `backend/tests/test_xgb_score.py` — new. Valid-row scoring, wrong `v`
  length, negative amount, missing fields, the `503` unavailable path, and
  a check that `/health`/`/api/graph` are unaffected.
- `backend/Dockerfile` — installs `requirements-xgb.txt` (with a BuildKit
  pip cache mount so rebuilds don't re-download from scratch); copies
  `ml/xgb_baseline` and `ml/models/xgb_baseline.joblib` into the image.
- `backend/Dockerfile.dockerignore` — restructured so blanket excludes
  (`**/*.joblib`, `**/*.parquet`, etc.) come first and specific
  re-includes (`ml/xgb_baseline/**` minus its `tests/`, and exactly
  `ml/models/xgb_baseline.joblib`) can win over them, gitignore-style.
  The training dataset (`**/*.parquet`) is never re-included, at any path.

## Design choices

- **Lazy imports, not just lazy model loading.** `xgb_baseline.py` doesn't
  import `pandas`/`xgb_baseline.inference` at module level — only inside
  `_load_model()`/`score_row()`. Verified: starting the service with
  `requirements.txt` only (no `-xgb`) still serves `/health`/`/api/graph`
  normally; only `/api/xgb-score` returns `503`. This satisfies
  backend/README.md's "Keep optional ML dependencies out of startup."
- **`model_mode: "xgboost_card_fraud_baseline"`**, a distinct literal value
  from `/api/graph`'s implicit `rules` mode — chosen so no client can
  mistake one model's output for the other's.
- **`nvidia-nccl-cu13` gets installed** as a transitive dependency of the
  `xgboost` PyPI wheel (the same wheel supports CPU and GPU). This is an
  unused shared library, not a GPU requirement — the model itself is
  trained and served with `tree_method="hist", device="cpu"`
  (`ml/xgb_baseline/train.py`), and no CUDA driver exists in this image.
  Flagged here because backend/README.md says "must not require... CUDA,"
  and this is the closest thing to an exception — it's inert, not invoked,
  but present in the dependency tree.

## Verification actually performed

Native (`backend/.venv`, after `pip install -r backend/requirements-xgb.txt`):
- `pytest backend/tests -q` → 28/28 passed.
- Without `-xgb` deps installed: `/health`/`/api/graph` → `200`;
  `/api/xgb-score` → `503`.
- With deps installed: `/api/xgb-score` with a plausible row →
  `200 {"score": 0.000125..., "is_fraud": false, "threshold": 0.95, ...}`;
  wrong-length `v` → `422` with a clear pydantic error.

Docker (`docker compose -f backend/compose.yaml up --build -d`, rebuilt
from a clean image):
- Build succeeded (~1.6 GB final image, up from ~260 MB — the added
  scientific-Python stack). Build took several minutes on this network due
  to large wheel downloads (`xgboost` ~58 MB); this is normal, not a hang.
- Live: `/health` → `200`; `/api/graph` → correct 6/7 topology with real
  `ml/rules` risk fields; `POST /api/xgb-score` → real inference (same
  result as native); malformed request → `422`.
- CORS: allowed for `http://localhost:3000`, absent for other origins.
- Container filesystem: confirmed `ml/xgb_baseline` present (source only,
  no `tests/`), `ml/models/xgb_baseline.joblib` present, and confirmed
  absent anywhere in the image: `.venv`, `.git`, `node_modules`, the 70MB
  training dataset. (`pyarrow`'s own tiny bundled test `.parquet` fixtures
  are present as part of that installed package — not the training set.)
- Restart: clean startup/shutdown log, identical `/api/graph` output
  after restart, non-root `appuser` confirmed via `whoami`.

## Known issue during this session (process note, not a code defect)

An earlier build attempt was killed prematurely after ~8 minutes based on a
wrong read of low CPU usage in the build process — the build was actually
still downloading large wheels over a slow (~300-600 KB/s) connection, not
stalled. The build was restarted and allowed to run to completion (~15
minutes total), which succeeded. No code change resulted from this; noted
here so a future slow rebuild isn't killed the same way.

## Remaining / out of scope

- No frontend consumes `/api/xgb-score` — it exists as a backend capability
  only, per this session's request.
- No rate limiting, batching, or async/background execution for
  `/api/xgb-score` — a single-row synchronous `predict_proba` call is fast
  enough on CPU that backend/README.md's "bounded inference execution"
  concern (aimed at expensive/stalled models) doesn't obviously apply here,
  but this hasn't been load-tested.
- No CI/reproducible-lockfile pinning beyond the exact versions in
  `requirements-xgb.txt`.
