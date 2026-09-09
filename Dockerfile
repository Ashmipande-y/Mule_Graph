# syntax=docker/dockerfile:1
#
# Single combined MuleGraph container: runs the FastAPI backend (port 8000)
# and the Next.js frontend (port 3000) as two processes inside one image,
# supervised by docker-entrypoint.sh. This trades Docker's usual
# one-process-per-container convention for operational simplicity -- one
# image, one container, one `docker run` -- at the cost of losing
# per-service restart/scaling isolation. See backend/Dockerfile and
# frontend/Dockerfile for the equivalent split-container images this
# replaces when a single container is not what's wanted.
#
# Build context is the repository root (this image needs backend/, data/,
# ml/, and frontend/ all together) -- see Dockerfile.dockerignore for
# exactly what crosses into the build.

# ---- Stage 1: build the Next.js frontend ----
FROM node:26-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: final image with both the Python and Node runtimes ----
FROM python:3.14-slim AS runtime

# Node.js is installed from the official binary tarball, pinned to the same
# version as the frontend-builder stage's node:26-slim base, so both stages
# run the identical Node build rather than whatever a distro package ships.
ARG NODE_VERSION=26.8.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl xz-utils ca-certificates libatomic1 \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm -rf /tmp/node.tar.xz \
    && apt-get purge -y --auto-remove curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Backend: Python deps + application code (mirrors backend/Dockerfile) ---
COPY backend/requirements-xgb.txt backend/requirements.txt ./backend/
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r backend/requirements-xgb.txt

COPY backend/app ./backend/app
COPY data/demo_transactions.json ./data/demo_transactions.json
# Directory-level COPY, not a specific-file COPY: both are optional, large,
# gitignored local artifacts (see data/aml/README.md, ml/models/README.md)
# that a fresh checkout never has. A specific-file COPY errors the whole
# build when its source is missing; copying the directory succeeds whether
# or not the optional file inside it is actually present (Dockerfile.dockerignore
# still restricts what's visible to exactly the known optional filenames --
# this isn't a broader COPY than before, just one that tolerates absence).
# `ml/models/README.md` (tracked) guarantees the `ml/models` directory
# itself exists even when both `.joblib` files are absent.
COPY data/aml/ ./data/aml/
COPY ml/rules ./ml/rules
COPY ml/xgb_baseline ./ml/xgb_baseline
COPY ml/aml_baseline ./ml/aml_baseline
COPY ml/models/ ./ml/models/

# --- Frontend: traced standalone server output only -- no source, no dev
# dependencies, no full node_modules (next.config.ts: output: "standalone") ---
COPY --from=frontend-builder /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-builder /app/frontend/public ./frontend/public

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Frontend and backend are still served on different ports, so this is
# still cross-origin from the browser's point of view even inside one
# container -- CORS_ORIGINS is required the same way it would be split
# across two containers.
ENV CORS_ORIGINS=http://localhost:3000 \
    LOG_LEVEL=INFO \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --no-create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/backend/.runtime \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
