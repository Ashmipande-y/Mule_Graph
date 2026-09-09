# Assessment endpoint contract (proposed, not implemented)

Status: **frontend-proposed, not implemented by the backend.** This is a
frontend-owned design document, not a change to the shared
`docs/api-contract.md` or `backend/docs/integration-contract.md` — those
stay backend/ML-owned per `CLAUDE.md`'s ownership boundaries. If this
contract is adopted, the backend owner should review and, if needed,
correct it before implementing.

## Why this exists

The transaction-entry and assessment-workspace feature
(`frontend/components/transactions/AssessmentWorkspaceSheet.tsx`) lets an
analyst enter new transactions and ask "what does the network look like
with these included?" Doing that correctly — assessing new transactions
*in the context of* the current network, not in isolation, since MuleGraph
detects network patterns like fan-out/convergence — requires a batch
endpoint that doesn't exist yet:

- `GET /api/graph` only returns the stored/static graph; it accepts no
  request body, so there is no way to hand it new transactions.
- `POST /api/xgb-score` scores one row of the unrelated card-fraud model in
  its own schema (`Time`/`Amount`/`V1`..`V28`) — sending UPI account
  transactions there would be nonsensical and is explicitly disallowed by
  `backend/README.md`'s "Model compatibility and failure behavior" section.

So `lib/services/assessmentClient.ts` calls the endpoint below. Since it
does not exist on the backend today, every call currently resolves the
"not connected" branch — that is the correct, honest behavior, not a bug.
See `components/investigation/AssessmentServiceNotConnected.tsx` for how
that's surfaced to the analyst, and `hooks/useConsoleData.ts`/
`lib/services/assessmentGraph.ts` for how a real response would flow into
the graph/table/inspector once implemented.

## Endpoint

```
POST /api/assess
Content-Type: application/json
```

### Request body

```json
{
  "transactions": [
    { "id": "TX_001", "sender": "ACC_VICTIM", "receiver": "ACC_A", "amount": 50000, "timestamp": "2026-01-01T10:00:00Z" }
  ]
}
```

Same per-transaction shape as `data/demo_transactions.json` and the
`/api/graph` edge contract: `id`/`sender`/`receiver` non-empty strings,
`amount` a positive integer (no booleans), `timestamp` a full UTC ISO 8601
string ending in `Z`, second precision. This is a **stateless** batch
evaluation — no ingestion, no persistence, no idempotency/409 semantics
like the ingestion endpoints `backend/README.md`'s Stage 2 proposes
(`POST /api/transactions`). It should behave like a version of the existing
`GET /api/graph` derivation (`app/services/graph.py` +
`app/adapters/ml_rules.py::assess_accounts`) that reads its transaction set
from the request body instead of `data/demo_transactions.json` — the
frontend deliberately sends the *entire* set to assess each time (its own
"current network" plus whatever new transactions the analyst is proposing),
mirroring how `assess_accounts` already re-evaluates the full set on every
`/api/graph` call.

### Response body

```json
{
  "status": "completed",
  "assessed_at": "2026-01-01T10:05:00Z",
  "model_mode": "rules",
  "accounts": [
    {
      "account_id": "ACC_A",
      "risk_score": 0.9317,
      "risk_level": "HIGH",
      "roles": ["source"],
      "finding_count": 1,
      "evidence_transaction_ids": ["TX_002", "TX_003", "TX_004"]
    },
    {
      "account_id": "ACC_VICTIM",
      "risk_score": null,
      "risk_level": "UNASSESSED",
      "roles": [],
      "finding_count": 0,
      "evidence_transaction_ids": []
    }
  ],
  "accounts_requiring_review": ["ACC_A"],
  "patterns": [
    {
      "pattern": "fan_out_convergence",
      "source_account": "ACC_A",
      "collector_account": "ACC_X",
      "intermediary_accounts": ["ACC_B", "ACC_C", "ACC_D"],
      "score": 0.9317,
      "score_method": "heuristic_v1 = 0.5*intermediary_ratio + 0.3*amount_conservation + 0.2*time_compactness, clipped to [0, 1]",
      "evidence": { "intermediary_ratio": 1.0, "amount_conservation": 0.8667, "time_compactness": 0.8583 }
    }
  ]
}
```

Field names deliberately mirror the serializers `ml/rules` already has
(`AccountRisk.to_dict()` in `ml/rules/account_risk.py`, `Finding.to_dict()`
in `ml/rules/detector.py`) so a real implementation could call
`rules.replay.evaluate_at` + `rules.account_risk.account_risk_from_findings`
directly on the request body's transactions and mostly just serialize the
existing objects — this was designed to be the smallest reasonable addition
to the existing rules pipeline, not a new detection system.

- `status`: `"completed"` (evaluation ran normally), `"partial"`, or
  `"failed"`.
- `accounts_requiring_review` is optional; if omitted, the frontend derives
  it from `risk_level` (`HIGH`/`MEDIUM`) — a presentation choice, not a
  claim about what the backend returned.
- Every field the frontend displays is shown exactly as returned. Nothing
  is invented if a field is absent (see `lib/services/assessmentClient.ts`'s
  mapping — optional arrays default to `[]`/`null`, never fabricated
  content).

### Error responses

| Status | Meaning | Frontend behavior |
| --- | --- | --- |
| `404` / `405` | Endpoint not implemented (current reality) | "Assessment service not connected," with this contract shown |
| `422` | Invalid transaction data | Shown as a validation error, backend `detail` surfaced verbatim |
| `5xx` | Server error | Shown as a service error, retryable |
| network failure | Backend unreachable | "Could not reach the backend," retryable |

None of these ever fall back to a fabricated result — see
`lib/services/assessmentClient.ts::submitAssessment`.

## Compatibility notes for a future implementer

- Do **not** wire this through `ml/xgb_baseline` — that model has no
  account/graph structure and is a different domain (card-present fraud).
- Preserve `risk_score: null` / `risk_level: "UNASSESSED"` for any account
  absent from every finding — never substitute a zero/safe score.
- If GraphSAGE is ever connected, `model_mode` should say so explicitly;
  the frontend never assumes or displays a model beyond what this field
  reports.
- CORS: `app/main.py`'s `CORSMiddleware` must include `POST` in
  `allow_methods` (already required for `/api/xgb-score`; see
  `backend/docs/integration-contract.md`'s 2026-09-09 entry) or a real
  browser's preflight will reject this endpoint too.
