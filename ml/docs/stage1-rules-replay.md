# Stage 1: Replay, Deterministic Rules, and Evidence

Status: **implemented and tested**, ML-only, entirely inside `ml/`. Not integrated
with FastAPI, the database, or the frontend — that integration is a future,
explicitly separate step to agree with Smit.

## What this is

A small, CPU-only, dependency-free (standard library only) deterministic detector
for one fraud pattern: **fan-out then convergence**. One source account sends to
several distinct intermediaries in a short window; a threshold number of those
intermediaries then forward funds on to one common collector, also within a short
window, after receiving it.

This is a rules *fallback* — a heuristic ranking mechanism, not a trained model and
not a probability estimate. It exists so the product has a working detector before
XGBoost (Stage 2) or GraphSAGE (Stage 3) exist, and so the eventual model-based
detectors have something to be compared against and fall back to if unavailable.

## Code layout (all inside `ml/`)

```
ml/rules/
  transactions.py   # Transaction dataclass, JSON loading, duplicate-id handling
  replay.py         # observable_transactions(), evaluate_at() -- the leakage guard
  detector.py        # DetectorConfig, Finding, detect_fan_out_convergence()
  account_risk.py    # AccountRisk, account_risk_from_findings()
ml/scripts/
  run_rules_demo.py  # manual CLI check against data/demo_transactions.json
ml/tests/
  test_transactions.py
  test_replay.py
  test_detector.py
  test_account_risk.py
```

Nothing here imports FastAPI, a database client, or anything under `frontend/` or
`backend/`. `ml/rules` only depends on the Python standard library.

## Directionality and thresholds

- **Directionality**: fan-out edges are `source -> intermediary`; convergence edges
  are `intermediary -> collector`, and a convergence edge only counts if its
  timestamp is *strictly after* the fan-out edge that funded it. The collector must
  be a different account from both the source and every intermediary.
- **Thresholds** (`rules.detector.DetectorConfig`, all explicit, all defaults —
  not fixture-derived constants baked into the logic):
  - `min_intermediaries` (default 3): minimum distinct intermediaries required on
    both the fan-out side and the convergence side.
  - `fan_out_window_seconds` (default 60): how tightly clustered the source's
    outgoing transactions must be to count as one fan-out group.
  - `convergence_window_seconds` (default 60): how soon after receiving funds an
    intermediary must forward them on for that transfer to count as convergence
    evidence.
  - `max_scoring_window_seconds` (default 120): only used to normalize the
    time-compactness term of the score into `[0, 1]`; does not gate detection.

These are hackathon-reasonable defaults, not values tuned to the canonical demo's
specific account IDs or amounts. The detector never references `ACC_A`, `ACC_X`, any
`TX_00N` id, or a hardcoded 34%/89%-style score anywhere in its logic — every account
and transaction id it operates on comes from the data passed in.

## Evidence, not a verdict

Each `Finding` records:
- `pattern`, `source_account`, `collector_account`, `intermediary_accounts`
- `fan_out_transaction_ids` / `convergence_transaction_ids` — the exact transactions
  backing the finding, preserved individually (repeated transfers are never
  collapsed into one edge or one number)
- `window_start` / `window_end`
- `score` and `score_method` — a hand-defined heuristic:
  `0.5*intermediary_ratio + 0.3*amount_conservation + 0.2*time_compactness`, clipped
  to `[0, 1]`
- `evidence` — the three underlying ratios plus raw totals, so the score is always
  explainable from the fields sitting right next to it

`Finding.to_dict()` and `AccountRisk.to_dict()` both include a literal
`"score_is_not_a_probability": true` field. This score is a ranking heuristic over
observed evidence strength — it is **not** a calibrated probability, **not** a
trained model's output, and **not** a measured performance metric (precision/recall/
etc. do not apply to a hand-defined formula with no train/test split). Any future UI
or LLM explanation layer consuming this must preserve that distinction and must not
present it as "the model is 93% confident this is fraud."

## Account-level risk is a separate, later step

`account_risk.py` deliberately keeps `AccountRisk` (per-account roll-up: roles,
max score across findings, evidence transaction ids) as a distinct type from
`Finding` (per-network-pattern evidence), per Stage 1 instructions. This is *not* the
same thing as the `/api/graph` node's `risk_score` / `risk_level` fields —
that mapping (thresholds, which score feeds which level, how multiple findings
combine) has not been agreed with Smit and is out of scope here. Nothing in this
module writes to or assumes the API contract shape.

## Replay: never see the future

`replay.observable_transactions(transactions, as_of)` filters to transactions with
`timestamp <= as_of`. `replay.evaluate_at(transactions, as_of, config)` is the only
supported way to score "as of" a point in time — it filters first, then calls the
detector, so a caller cannot accidentally pass future transactions into an earlier
snapshot's evidence. This is enforced structurally, not by caller discipline:
`detect_fan_out_convergence` itself has no notion of "now" and will use whatever it
is given.

Tested directly: evaluating the canonical scenario right after the last fan-out
transaction (before any convergence transaction has happened) produces zero
findings; evaluating after all three convergence transactions are observable
produces exactly one. A partial-convergence snapshot (two of three intermediaries
converged) also correctly produces zero findings, since it's below
`min_intermediaries`.

## Tests and what they cover

24 tests, `python -m unittest discover -s ml/tests -t ml`, all passing (see the
Stage 1 handoff for the exact run and output). Coverage:

- **Positive case**: the canonical 7-transaction demo fixture produces exactly one
  finding, with the expected accounts, transaction ids, and a score in `[0, 1]`.
- **Positive case, generic ids**: the same shape, but with unrelated account and
  transaction identifiers, to demonstrate the detector isn't secretly keyed to the
  fixture's specific strings.
- **Near-miss: fan-out without convergence** (intermediaries forward to three
  different accounts, no common collector) — zero findings.
- **Near-miss: convergence outside the window** (forwarding happens ~190s after
  receipt against a 60s window) — zero findings.
- **Near-miss: duplicate input records** (the exact same transaction record appended
  twice) — identical score and evidence totals with or without the duplicate, i.e.
  the duplicate is not double-counted.
- **Near-miss: below-threshold intermediary count** — zero findings.
- **Near-miss: collector coincides with the source or an intermediary** — such
  transfers are excluded from convergence evidence entirely.
- **Replay/no-leakage**: see above.
- **Transaction loading**: canonical fixture parses correctly, boolean amounts and
  invalid calendar dates are rejected, duplicate ids collapse to one record.
- **Account-risk attribution**: each intermediary's `evidence_transaction_ids` is
  exactly its own fan-out/convergence pair, not every transaction in the finding
  (a real bug caught and fixed during this implementation — see the handoff).

## Explicit non-scope (per the brief's own gating)

- No coordination with Smit has happened yet — this module is ready to be wired into
  a replay/inference interface once that's agreed, but no interface has been frozen.
- No FastAPI, database, or frontend code was touched or added.
- Stage 2 (XGBoost) has not started: its own gate in the brief requires this
  rules/replay path to be *integrated* (with the backend) and to be explicitly
  requested, and it also requires a real dataset decision (e.g. IBM AML) that hasn't
  been made. Integration hasn't happened (`backend/` and `frontend/` are still empty
  placeholders as of this writing), so Stage 2 is not yet eligible regardless of
  Stage 1 being done.
- Stage 3 (GraphSAGE) is untouched, per the explicit gate: it requires Stage 2 to
  work and be requested first. No PyTorch Geometric code, imports, or installs exist
  anywhere in this change.
