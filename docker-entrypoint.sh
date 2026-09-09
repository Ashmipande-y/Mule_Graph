#!/bin/sh
# Supervises the two processes this single container runs: the FastAPI
# backend (uvicorn, port 8000) and the Next.js frontend (standalone server,
# port 3000). POSIX sh (not bash) so it runs unmodified on the slim base
# image. If either process dies, this exits non-zero so Docker's restart
# policy (see compose.yaml: restart: unless-stopped) restarts the whole
# container rather than silently running with only one half alive.
set -e

# AML_MODE controls what happens when the IBM AML dataset/model artifacts
# (both optional, gitignored, never fetched automatically -- see
# data/aml/README.md and ml/models/README.md) aren't present:
#   optional (default): log their status and start the container regardless
#                        -- the canonical demo (/api/graph, /api/assess) and
#                        any present-on-its-own xgb-score model are
#                        unaffected either way; /api/aml/* alone returns a
#                        clear error until the artifacts are supplied.
#   required:            check the same two files, but refuse to start the
#                        container at all if either is missing, printing
#                        exactly what to run to obtain them. Never
#                        downloads or trains anything itself.
AML_MODE="${AML_MODE:-optional}"

check_aml_prerequisites() {
    missing=0
    if [ ! -f "/app/data/aml/transfers_inr.csv" ]; then
        echo "docker-entrypoint: missing data/aml/transfers_inr.csv -- run scripts/prepare_aml_dataset.py against your own downloaded IBM AML source file (see data/aml/README.md)." >&2
        missing=1
    fi
    if [ ! -f "/app/ml/models/aml_baseline.joblib" ]; then
        echo "docker-entrypoint: missing ml/models/aml_baseline.joblib -- train it with ml/scripts/run_aml_baseline.py after the dataset above is prepared (see ml/aml_baseline/README.md)." >&2
        missing=1
    fi
    if [ "$missing" = "0" ]; then
        echo "docker-entrypoint: AML dataset and model both present -- /api/aml/* fully available."
        return
    fi
    if [ "$AML_MODE" = "required" ]; then
        echo "docker-entrypoint: AML_MODE=required and the above artifacts are missing -- refusing to start. Provide them (see messages above) or unset AML_MODE / set it to 'optional' to run the lightweight demo instead." >&2
        exit 1
    fi
    echo "docker-entrypoint: continuing without full AML support (AML_MODE=optional) -- the canonical demo and /api/assess are unaffected; /api/aml/* will report the specific missing artifact until it's supplied."
}
check_aml_prerequisites

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo "docker-entrypoint: shutting down"
    [ -n "$BACKEND_PID" ] && kill -TERM "$BACKEND_PID" 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup TERM INT

python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "docker-entrypoint: backend (uvicorn) started, pid $BACKEND_PID"

node /app/frontend/server.js &
FRONTEND_PID=$!
echo "docker-entrypoint: frontend (next) started, pid $FRONTEND_PID"

while true; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "docker-entrypoint: backend exited unexpectedly" >&2
        cleanup
        exit 1
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "docker-entrypoint: frontend exited unexpectedly" >&2
        cleanup
        exit 1
    fi
    sleep 2
done
