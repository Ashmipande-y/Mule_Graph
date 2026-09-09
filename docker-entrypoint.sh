#!/bin/sh
# Supervises the two processes this single container runs: the FastAPI
# backend (uvicorn, port 8000) and the Next.js frontend (standalone server,
# port 3000). POSIX sh (not bash) so it runs unmodified on the slim base
# image. If either process dies, this exits non-zero so Docker's restart
# policy (see compose.yaml: restart: unless-stopped) restarts the whole
# container rather than silently running with only one half alive.
set -e

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
