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
  "edges": [ /* Edge */ ]
}
```

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

## Amount and timestamp rules (all endpoints)

- Amounts are positive integers. Booleans are not valid amounts even though Python
  and JSON both technically allow `true`/`false` where a number is expected in some
  loose parsers — reject them explicitly.
- Timestamps are full UTC ISO 8601 strings ending in `Z`, second precision (no
  fractional seconds), and must be valid calendar dates (e.g. `2026-02-30` is invalid).

## What is intentionally not specified yet

- Any endpoint related to risk scoring, evidence, or explanations (Stage 1+).
- Any pagination, filtering, or search on `/api/graph` — the current scope is "return
  the whole graph."
- WebSocket or streaming updates — REST first per the architecture decision.
- Database-backed persistence — PostgreSQL is a later stage; JSON/in-memory is the
  guaranteed local demo fallback for now.
