# Milestone 1: Static End-to-End Graph Flow

## Goal

```
static transaction JSON -> FastAPI -> Next.js -> interactive graph
```

An analyst opens the frontend, sees the six-account / seven-transaction demo network
rendered as an interactive graph, can select an account to inspect its directed
transfers and INR amounts, and can tell at a glance that the data is synthetic and
risk is not yet assessed.

## Status as of Stage 0 (2026-09-07)

This milestone is **not yet met**. Stage 0 only repaired the shared data foundation
(canonical fixtures + validator) that both the backend and frontend need in order to
build toward this gate. Nothing below has been implemented or verified by this work.

## Gate checklist

All items are **pending** unless a specific item is marked done with how it was
verified. A checked box without an actual run/observation does not count — see
"What counts as evidence" below.

- [ ] FastAPI serves the canonical six-node / seven-edge graph via `GET /api/graph`,
      derived from `data/demo_transactions.json` (not served as a static file).
- [ ] `GET /health` returns HTTP 200 `{"status":"ok"}`.
- [ ] Next.js fetches `/api/graph` and renders it with `react-force-graph-2d`.
- [ ] An analyst can select an account node and see its directed transfers (in/out)
      with INR amounts and timestamps.
- [ ] The UI visibly marks the data as synthetic/demo and risk as unassessed (e.g. a
      banner or badge — not implied only by `risk_level: "UNASSESSED"` in a tooltip).
- [ ] Loading state, empty state (no transactions), and API error state all render
      distinctly in the UI.
- [ ] Stopping the backend and clicking Reload produces a **visible error** in the UI,
      not a silent fallback to a bundled fixture.
- [ ] Restarting the backend and clicking Reload recovers the graph view.
- [ ] Setup works end-to-end from a fresh checkout using documented commands only
      (no undocumented manual steps).

## What counts as evidence

- A fixture screenshot alone is not evidence — it doesn't show the fetch, loading, or
  error paths.
- A checked box without a description of what was actually run and observed is not
  evidence.
- A unit test passing is not evidence of the *integration* — this gate is specifically
  about the live FastAPI -> Next.js -> browser path.
- Acceptable evidence: a short note of the exact commands run, what was seen in the
  browser/network tab, and what happened when the backend was stopped and restarted.

## Ownership for this milestone

- Backend (`GET /health`, `GET /api/graph`, transaction -> graph derivation): Smit.
- Frontend (fetch, `react-force-graph-2d` rendering, account inspection panel,
  loading/empty/error states): Adnan.
- Shared data contract these both depend on: `data/demo_transactions.json`,
  `data/graph.example.json`, `docs/api-contract.md` — repaired in Stage 0
  (see `docs/handoffs/ml-foundation.md`), owned going forward by whoever changes the
  contract next (expected: Smit, in coordination with Ashmi).
- ML (Jatin) does not implement this milestone. Detection (Stage 1+) begins only after
  this gate is verified.

## Explicitly out of scope for this milestone

- Any risk scoring, rules, or model inference — nodes/edges carry `risk_score: null`
  and `risk_level: "UNASSESSED"` throughout.
- Database persistence (PostgreSQL) — JSON/in-memory is the guaranteed fallback.
- WebSocket/streaming — REST only.
