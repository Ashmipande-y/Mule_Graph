# syntax=docker/dockerfile:1
#
# Build context is the repository root (see backend/compose.yaml), because
# this image needs data/demo_transactions.json and ml/ alongside backend/ —
# none of those are available if the context were backend/ alone.
#
# Installs backend/requirements-xgb.txt, a superset of requirements.txt that
# additionally pulls in xgboost/pandas/numpy/scipy/pyarrow/scikit-learn/
# joblib for POST /api/xgb-score (backend/app/api/xgb_score.py). Those
# packages are NOT imported at process startup — see
# backend/app/adapters/xgb_baseline.py's docstring — so /health and
# /api/graph are unaffected either way; this only changes what
# /api/xgb-score can do. No CUDA/GPU packages anywhere (the trained model
# runs tree_method="hist", device="cpu" — see ml/xgb_baseline/train.py).

FROM python:3.14-slim

WORKDIR /app

COPY backend/requirements-xgb.txt backend/requirements-xgb.txt
COPY backend/requirements.txt backend/requirements.txt
# Cache mount so a retried/rebuilt image doesn't re-download these (large:
# xgboost/pandas/scipy/pyarrow) wheels from scratch every time.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r backend/requirements-xgb.txt

# Application code, canonical demo data, and the ML packages, kept at the
# same relative paths as the repository so existing imports and
# backend/app/config.py's repo-relative path resolution keep working
# unchanged inside the container.
COPY backend/app backend/app
COPY data/demo_transactions.json data/demo_transactions.json
COPY ml/rules ml/rules
COPY ml/xgb_baseline ml/xgb_baseline
COPY ml/models/xgb_baseline.joblib ml/models/xgb_baseline.joblib

# ml/rules and ml/xgb_baseline are independent of FastAPI. backend/app/
# adapters/_ml_path.py is the one place that puts /app/ml on sys.path at
# import time (repo-relative, independent of cwd), so no PYTHONPATH
# override is needed here.
#
# Note what's deliberately NOT in this image: ml/data/raw/*.parquet (the
# 70MB training dataset — training happens outside the image, once, not on
# every build/start; see backend/Dockerfile.dockerignore) and ml/models/*
# other than the one trained bundle actually served.
ENV CORS_ORIGINS=http://localhost:3000 \
    LOG_LEVEL=INFO

RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --no-create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/backend/.runtime \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]
