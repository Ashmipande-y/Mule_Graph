# API Contract

Status: Stage 0 draft, authored by ML while repairing the shared data foundation.
Owner going forward: Smit (backend). Please review and correct if backend
implementation needs to diverge from this.

This document describes the contract the frontend (Adnan) and ML (Jatin) code will
rely on for the first end-to-end milestone. It does not describe how the backend
computes the response internally.

## Source of truth

- `data/demo_transactions.json` is the **runtime source of truth**. The backend must
  derive `/api/graph` from this file (or its future replacement — a real transaction
  store), not by serving a static graph file directly.
- `data/graph.example.json` is a **frontend development reference only** — a
  pre-computed example of what `/api/graph` should return for the canonical demo
  transactions. It lets frontend work proceed before the backend endpoint exists, and
  gives both sides one fixture to test the transaction→graph derivation against.
- Both files are validated together by `python scripts/validate_demo.py`, which checks
  that `graph.example.json` is an exact, correctly-derived representation of
  `demo_transactions.json` for the canonical seven-transaction demo scenario.

## `GET /health`

Returns HTTP 200 with:

```json
{ "status": "ok" }
```

## `GET /api/graph`

Returns HTTP 200 with:

```json
{
  "nodes": [ /* Node */ ],
  "edges": [ /* Edge */ ],
  "findings": [ /* Finding */ ]
}
```

`findings` was added 2026-09-09 — see `backend/docs/integration-contract.md`'s entry on it for full
rationale and the `Finding` shape (it mirrors `ml/rules/detector.py::Finding.to_dict()` exactly: the
same network-level evidence that already feeds each node's `risk_score`/`risk_level`, now also
exposed directly so the frontend can derive alerts/cases from real evidence instead of only a
per-account rollup).

### Node shape

```json
{
  "id": "ACC_A",
  "label": "Account A",
  "risk_score": null,
  "risk_level": "UNASSESSED"
}
```

- `id`: account identifier, unique, nonempty string. Every account referenced as a
  sender or receiver in the transaction data must appear exactly once as a node.
- `label`: a display label for the account. For the canonical demo accounts, use
  exactly: `ACC_VICTIM` → `Victim`, `ACC_A` → `Account A`, `ACC_B` → `Account B`,
  `ACC_C` → `Account C`, `ACC_D` → `Account D`, `ACC_X` → `Collector X`. These are
  **authored scenario labels for the demo UI, not model output** — they must never be
  used as model features or influence risk scoring.
- `risk_score`: `null` until detection (Stage 1+) is integrated. When present, a float
  in `[0, 1]`.
- `risk_level`: `"UNASSESSED"` until detection is integrated. Future values `"LOW"`,
  `"MEDIUM"`, `"HIGH"` are reserved; thresholds and mapping from `risk_score` are not
  yet defined and are out of scope for Stage 0.

Nodes must be sorted by `id` (ordinary string sort).

### Edge shape

```json
{
  "id": "TX_001",
  "source": "ACC_VICTIM",
  "target": "ACC_A",
  "amount": 50000,
  "timestamp": "2026-01-01T10:00:00Z"
}
```

- `id`: the transaction ID this edge represents. One edge per transaction — repeated
  transfers between the same two accounts must **not** be collapsed into one edge;
  each transaction is separate evidence.
- `source` / `target`: mapped directly from the transaction's `sender` / `receiver`.
- `amount`: positive integer, INR, copied from the transaction.
- `timestamp`: full UTC ISO 8601 string, second precision, e.g. `2026-01-01T10:00:00Z`.

Edges must be sorted by `(timestamp, id)`.

### Error and empty-data behavior

- A valid but empty transaction dataset (no transactions) returns HTTP 200 with
  `{ "nodes": [], "edges": [] }` — not an error.
- A missing or malformed server-side transaction file returns an explicit HTTP 500
  with a JSON error body, and the backend should log the underlying cause server-side.
  It must not silently fall back to a bundled fixture — the frontend gate explicitly
  requires that stopping the backend and reloading produces a visible error, not a
  silent fixture fallback.

## `GET|POST /api/cases`

Added 2026-09 alongside the events/live-updates milestone (`backend/app/services/case_service.py`,
`backend/app/api/cases.py`). A **case** is a persisted (SQLite, `CASE_DB_PATH`, default
`backend/.runtime/cases.sqlite3`) investigation record pinned to one server-verified `Finding`
from `/api/graph`'s evaluation — it is never created from client-asserted risk data.

### Workspace scoping

Every case route takes a workspace via the `X-Workspace-ID` header or a `workspace_id` query
param (default `"default"`); reads and writes are strictly scoped to it. Unlike `/api/events`,
the wildcard workspace `"*"` is rejected here with `422` — a case must belong to exactly one
workspace. A case created in one workspace is invisible (`404`/absent from listings) from any
other workspace — this is scoping for multi-desk isolation in the demo, not authentication.

### `POST /api/cases`

Request body extends `/api/assess`'s `{ "transactions": [...] }` with the specific finding to
pin the case to:

```json
{
  "transactions": [ /* same shape as POST /api/assess */ ],
  "source_account": "ACC_A",
  "collector_account": "ACC_X",
  "intermediary_accounts": ["ACC_B", "ACC_C", "ACC_D"]
}
```

The backend re-validates `transactions` and re-runs the same `ml/rules` evaluation `/api/graph`
and `/api/assess` use — it never trusts a client-submitted finding. Returns `422` if the
transactions don't actually validate, or if no finding in the result matches the given
`source_account`/`collector_account`/`intermediary_accounts` triple.

On success, returns `200` with the full case record:

```json
{
  "case_id": "CASE_<sha256-derived>",
  "workspace_id": "default",
  "title": "ACC_A → ACC_X",
  "account_ids": ["ACC_A", "ACC_B", "ACC_C", "ACC_D", "ACC_X"],
  "pattern": "fan_out_convergence",
  "status": "new",
  "revision": 1,
  "notes": [],
  "history": [],
  "created_at": "2026-09-10T12:00:00+00:00",
  "updated_at": "2026-09-10T12:00:00+00:00",
  "finding": { /* Finding, same shape as /api/graph's findings[] */ },
  "graph": { /* the GraphResponse this finding was derived from */ },
  "transactions": [ /* validated, sorted by (timestamp, id) */ ]
}
```

**Idempotency**: `case_id` is a deterministic hash of the sorted transaction set plus the
finding — re-opening a case with *exactly* the same evidence returns the same `case_id` and
preserves its current status/notes/history unchanged. Any material change to the evidence
(even a 1-rupee amount change on one transaction) is a different case, with a new `case_id`,
`status: "new"`.

### `GET /api/cases`

Lists cases in the caller's workspace, newest-`updated_at` first. Returns `[]`, never an error,
when the workspace has no cases.

### `GET /api/cases/{case_id}`

Returns the case record, or `404` if it doesn't exist **in the caller's workspace** (a case that
exists in a different workspace is indistinguishable from one that doesn't exist at all).

### `POST /api/cases/{case_id}/status`

```json
{ "status": "investigating", "expected_revision": 1, "author": "analyst", "note": "optional" }
```

- `status`: one of `new`, `investigating`, `flagged`, `closed`. Valid transitions:
  `new` → `investigating | flagged | closed`; `investigating` → `flagged | closed`;
  `flagged` → `investigating | closed`; `closed` → `investigating`. Any other transition, or an
  unrecognized status, is rejected with `422`. Re-submitting the *current* status is always
  allowed (a note-only amendment) and does not count as a transition.
- `expected_revision`: optimistic-concurrency guard. If it doesn't match the case's current
  `revision`, the write is rejected outright with `409` (nothing is persisted — a stale write
  never partially applies) and the caller must re-`GET` and retry against the fresh revision.
- On success: `revision` increments by 1, `note` (if given) is appended to `notes`, an entry is
  appended to `history`, and a `case_updated` event (`{case_id, previous_status, new_status,
  account_ids, updated_at, revision, author, note}`) is published to that case's workspace on
  the event bus (`GET /api/events` SSE or `GET /api/events/poll`) — consumers should refetch the
  case rather than trust the event payload as the full record. A same-status update with no note
  text is a true no-op: no revision bump, no event, the unchanged case is returned as-is.
- `404` if the case doesn't exist in the caller's workspace.

## Amount and timestamp rules (all endpoints)

- Amounts are positive integers. Booleans are not valid amounts even though Python
  and JSON both technically allow `true`/`false` where a number is expected in some
  loose parsers — reject them explicitly.
- Timestamps are full UTC ISO 8601 strings ending in `Z`, second precision (no
  fractional seconds), and must be valid calendar dates (e.g. `2026-02-30` is invalid).

## What is intentionally not specified yet

- Any pagination, filtering, or search on `/api/graph` — the current scope is "return
  the whole graph."
- Cross-workspace case search/aggregation, or any authentication behind workspace scoping
  (`X-Workspace-ID` is a label for demo multi-desk isolation, not a credential).

Since this document's Stage 0 draft, `/api/assess` (risk scoring/evidence; see
`frontend/docs/assessment-endpoint-contract.md`), `GET /api/events` + `GET /api/events/poll`
(SSE and polling live updates; see `backend/app/api/events.py`), and `POST|GET /api/cases`
(SQLite-backed persistence; see above) have all shipped — the bullets that used to defer them
here were removed rather than left stale.
