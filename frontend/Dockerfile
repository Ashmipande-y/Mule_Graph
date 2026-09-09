# syntax=docker/dockerfile:1
#
# Build context is frontend/ itself (see compose.yaml) -- unlike
# backend/Dockerfile, this service needs nothing from outside frontend/:
# frontend/data/demo_transactions.json is already a byte-for-byte bundled
# copy of the repo-root fixture (see lib/services/dataSource.ts), so the
# "simulation" data mode this app defaults to is fully self-contained.
#
# Three stages: install dependencies once, build once, then copy only the
# traced `next build` output (`output: "standalone"` in next.config.ts, a
# pruned server + node_modules subset) into a minimal runtime image -- no
# dev dependencies, no source tree, no full node_modules.
#
# Base image pinned to node:26-slim to match this machine's installed Node
# (v26.5.0, verified via `node -v`), the same "pin to what's actually
# installed" approach backend/Dockerfile takes with python:3.14-slim.

FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM node:26-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# node:26-slim already ships an unprivileged "node" user (uid/gid 1000) --
# reuse it instead of creating a new one.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

CMD ["node", "server.js"]
