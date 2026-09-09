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

This milestone was **not yet met** at Stage 0. Stage 0 only repaired the shared data
foundation (canonical fixtures + validator) that both the backend and frontend need
in order to build toward this gate.

## Update (2026-09-09): every item below now has real, run evidence

Everything on the checklist below has since been implemented and exercised with
actual commands/tests, cited inline. This reflects what this codebase's automated
tests and this session's manual verification actually observed — it is not a
substitute for whatever additional team sign-off process (recorded demo, backup,
final submission coordination) the project's owners want on top of it; see
`backend/README.md`'s own completion checklist for that broader process, which
remains theirs to close out.

## Gate checklist

- [x] FastAPI serves the canonical six-node / seven-edge graph via `GET /api/graph`,
      derived from `data/demo_transactions.json` (not served as a static file).
      Evidence: `backend/tests/test_graph.py` (asserts exact node/edge counts and
      content against `data/graph.example.json`); `e2e/canonical-graph.spec.ts`
      (real browser, real backend).
- [x] `GET /health` returns HTTP 200 `{"status":"ok"}`. Evidence:
      `backend/tests/test_graph.py`, exercised live in every Docker verification
      this session (see root `README.md`).
- [x] Next.js fetches `/api/graph` and renders it with `react-force-graph-2d`.
      Evidence: `frontend/components/graph/GraphCanvasInner.tsx`;
      `e2e/data-modes.spec.ts` (live-mode fetch rendered in a real browser).
- [x] An analyst can select an account node and see its directed transfers (in/out)
      with INR amounts and timestamps. Evidence:
      `frontend/components/investigation/AccountInspector.tsx`;
      `e2e/canonical-graph.spec.ts` (selects `ACC_A` via the accessible list,
      asserts its evidence score renders).
- [x] The UI visibly marks the data as synthetic/demo and risk as unassessed (e.g. a
      banner or badge — not implied only by `risk_level: "UNASSESSED"` in a tooltip).
      Evidence: `frontend/components/shared/DemoDataBanner.tsx`, rendered in every
      layout; `RiskBadge` renders `UNASSESSED` explicitly for `ACC_VICTIM`.
- [x] Loading state, empty state (no transactions), and API error state all render
      distinctly in the UI. Evidence: `frontend/components/shared/States.tsx`
      (`LoadingState`/`EmptyState`/`ErrorState`), used throughout; live-mode
      loading/error paths specifically covered by `e2e/backend-failure.spec.ts`.
- [x] Stopping the backend and clicking Reload produces a **visible error** in the UI,
      not a silent fallback to a bundled fixture. Evidence:
      `e2e/backend-failure.spec.ts` points live mode at an address nothing is
      listening on and asserts a real error renders (`lib/services/apiClient.ts`
      never falls back to bundled data on failure).
- [x] Restarting the backend and clicking Reload recovers the graph view. Evidence:
      same test, second half — repointing at the real backend and re-testing
      recovers a real, populated graph.
- [x] Setup works end-to-end from a fresh checkout using documented commands only
      (no undocumented manual steps). Evidence: `docker compose up --build -d`
      verified from a simulated fresh checkout (no `data/aml/transfers_inr.csv` or
      `ml/models/*.joblib` present) — see root `README.md` and
      `ml/models/README.md`.

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
