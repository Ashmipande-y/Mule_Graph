# Stage 1 Handoff: Rules/Replay Detector

Date: 2026-09-07
Branch: `feat/ml-foundation`
Scope: ML-only, all changes confined to `ml/`.

## 1. Files created

All new; nothing outside `ml/` was touched in this stage.

```
ml/rules/__init__.py
ml/rules/transactions.py     # Transaction dataclass, JSON loading, dedup-by-id
ml/rules/replay.py           # observable_transactions(), evaluate_at()
ml/rules/detector.py         # DetectorConfig, Finding, detect_fan_out_convergence()
ml/rules/account_risk.py     # AccountRisk, account_risk_from_findings()
ml/scripts/run_rules_demo.py # manual CLI check against data/demo_transactions.json
ml/tests/__init__.py
ml/tests/test_transactions.py
ml/tests/test_replay.py
ml/tests/test_detector.py
ml/tests/test_account_risk.py
ml/docs/stage1-rules-replay.md          # design doc (what/why)
ml/docs/handoffs/stage1-rules-replay.md # this file
ml/README.md                            # updated status/progression
```

`data/`, `scripts/`, `docs/` (outside `ml/`), `frontend/`, `backend/` were not
modified. `ml/rules` reads `data/demo_transactions.json` but does not write to it or
to anything outside `ml/`.

## 2. Exact commands run and actual results

Full test suite, from repo root:

```
python -m unittest discover -s ml/tests -t ml -v
```

Result: **24 tests, all passing** (`OK`). Breakdown:
- `test_transactions.py` — 5 tests (canonical load, sort order, boolean-amount
  rejection, invalid-date rejection, duplicate-id collapse).
- `test_replay.py` — 7 tests (snapshot filtering at various `as_of` times, naive
  datetime rejection, and the three no-future-leakage cases below).
- `test_detector.py` — 7 tests (2 positive-case, 5 near-miss).
- `test_account_risk.py` — 5 tests (role assignment, per-account evidence
  attribution correctness).

Manual demo run, from repo root:

```
python ml/scripts/run_rules_demo.py
```

Result: loads 7 transactions, reports exactly 1 finding —
`source_account: ACC_A`, `collector_account: ACC_X`,
`intermediary_accounts: [ACC_B, ACC_C, ACC_D]`, `score: 0.9317`, plus the full
evidence breakdown and per-account risk roll-up for all 5 involved accounts. Full
output captured during this session; re-run to reproduce.

## 3. What was verified, specifically

**Positive case**: the canonical 7-transaction demo fixture produces exactly one
finding, with the exact expected source/collector/intermediaries and the exact
fan-out/convergence transaction ids (`TX_002`-`TX_004` / `TX_005`-`TX_007`).

**Generic-id positive case**: the same pattern shape, but built with unrelated
account/transaction identifiers (`P`, `Q`, `R`, `S`, `Z`, `E1`-`E6`), confirms the
detector logic is not secretly keyed to the fixture's specific strings — this is a
behavioral test of the "no hardcoded IDs" requirement, not just a code-reading claim.

**Near-misses, all correctly producing zero findings**:
- Fan-out with no common convergence (three intermediaries forward to three
  different accounts).
- Convergence outside the configured window (forwarding ~190s after receipt against
  a 60s window).
- Fewer than the minimum required intermediaries (2 vs. default minimum 3).
- A "collector" that is actually the source or an existing intermediary (excluded
  from convergence evidence, dropping the count below threshold).

**Duplicate input records**: the same transaction record (same id) appended twice
to the input list produces an identical score and identical evidence totals to the
non-duplicated input — confirmed by direct comparison in
`test_duplicate_input_records_do_not_inflate_evidence`, not just by code inspection.

**Replay / no-future-leakage**: evaluating the canonical scenario at the timestamp
of the last fan-out transaction (before any convergence transaction has happened)
produces zero findings; evaluating once all three convergence transactions are
observable produces exactly one; a partial-convergence snapshot (two of three)
still produces zero, since it's below `min_intermediaries`. This is the concrete,
tested form of "never use future transfers when scoring an earlier replay
snapshot" — enforced structurally by `replay.evaluate_at` filtering before
detection, not left to caller discipline.

## 4. A bug found and fixed during this stage

Initial `account_risk_from_findings` credited every intermediary in a finding with
*all* of that finding's fan-out and convergence transaction ids, not just the pair
it was actually party to (e.g. `ACC_B` was showing `TX_003`/`TX_004`/`TX_006`/`TX_007`
as its own evidence, which belong to `ACC_C`/`ACC_D`). Caught by writing
`test_account_risk.py` before trusting the manual demo output, since the demo run's
first version showed this over-attribution directly. Fixed by zipping
`intermediary_accounts`, `fan_out_transaction_ids`, and `convergence_transaction_ids`
together (they're parallel tuples in `Finding`, built from the same iteration order
in `detector.py`) instead of passing the whole finding's transaction sets to every
intermediary. Verified fixed both by the new test and by re-running the demo script
and reading the corrected per-account `evidence_transaction_ids`.

## 5. Score semantics (do not skip this when this feeds a UI or LLM layer later)

The `score` on a `Finding` (and the `max_score` it rolls up into on an `AccountRisk`)
is `0.5*intermediary_ratio + 0.3*amount_conservation + 0.2*time_compactness`, a
hand-defined heuristic. It is explicitly **not**:
- a calibrated probability of fraud,
- a trained model's output,
- a measured performance metric (precision/recall/AUC do not apply — there is no
  train/test split here, just a formula).

Both `Finding.to_dict()` and `AccountRisk.to_dict()` carry a literal
`"score_is_not_a_probability": true` field so this can't be silently lost by a
consumer that only reads the numeric score. Full rationale in
`ml/docs/stage1-rules-replay.md`.

## 6. Remaining blockers and the next required team handoff

- **No blocker on Stage 1 itself** — it's complete, tested, and self-contained.
- **Stage 2 (XGBoost) is not eligible yet**, per the brief's own gate, not just a
  scope choice made here: it requires the rules/replay path to be integrated with
  the backend (it isn't — `backend/` is still an empty placeholder) and a real
  dataset decision (source, license, schema, target definition for something like
  IBM AML — none of that has been verified). Both are real dependencies, not
  formalities.
- **Stage 3 (GraphSAGE) remains untouched**, per explicit instruction. No PyTorch
  Geometric code, imports, or installs were added anywhere.
- **Next required handoff**: application integration — Smit (backend) building
  `GET /api/graph` from `data/demo_transactions.json` per `docs/api-contract.md`,
  and Adnan (frontend) rendering it, to close the Milestone 1 gate
  (`docs/milestone-1.md`). Once that's verified end-to-end, `ml/rules` is ready to be
  wired into a real inference interface — the Finding/AccountRisk shapes here are a
  reasonable starting point for that conversation with Smit, but nothing about that
  interface has been agreed or frozen yet.
