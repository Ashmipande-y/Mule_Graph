# Stage 0 Handoff: ML/Data Foundation Repair

Date: 2026-09-07
Branch: `feat/ml-foundation`
Author: ML (via Claude Code), on behalf of Adnan/Jatin's ML track.

## 1. Files created or changed, and why

| File | Change | Why |
| --- | --- | --- |
| `data/demo_transactions.json` | Populated (was `[]`) | Canonical seven-transaction demo scenario — the runtime source of truth both backend and frontend need. |
| `data/graph.example.json` | Populated (was `{}`) | Frontend development reference: the same scenario in the `/api/graph` node/edge shape. |
| `scripts/validate_demo.py` | Replaced placeholder (`print("validate demo")`) with a real stdlib-only validator | Needed a way to actually catch drift/corruption in the two fixtures above; there was no validation logic before. |
| `ml/README.md` | Populated (was `# ML`) | Record current ML status and the staged roadmap for Jatin. |
| `docs/ml/environment.md` | New file | Record the local machine's Python/RAM/GPU/CUDA state without installing anything, for future framework-version decisions. |
| `docs/handoffs/ml-foundation.md` | New file (this document) | Stage 0 handoff record. |
| `docs/api-contract.md` | Populated (was `# API Contract`) | Was a placeholder; documented the `/health` and `/api/graph` contract implied by the canonical fixtures so Smit/Ashmi have a written contract to build against or correct. |
| `docs/milestone-1.md` | Populated (was `# Milestone 1`) | Was a placeholder; documented the end-to-end gate criteria from the handoff brief, with explicit "not yet met" status. |
| `.gitignore` | Extended | Added patterns for Python venvs, secrets/.env, generated ML artifacts (checkpoints/model files), and common editor/OS junk. Existing patterns (`node_modules/`, `__pycache__/`, `.DS_Store`) preserved; the two demo JSON fixtures under `data/` remain tracked (not covered by any new pattern). |

Note: `docs/handoffs/foundation.md` already existed as a separate placeholder file
(`# Foundation Handoff`) not mentioned in my task brief's file list. I left it
untouched — out of my authorized scope, and possibly another team member's file.

Not touched: `frontend/`, `backend/` (only `.gitkeep` placeholders present, left as
is), `AGENTS.md`, `README.md` (root) — none of these were in my authorized scope for
Stage 0.

## 2. Exact commands run and actual results

Repository inspection (before any changes):

```
git status            -> On branch main, up to date with origin/main, clean
git branch -a         -> main (+ remotes/origin/main, remotes/origin/HEAD)
git remote -v         -> origin https://github.com/AdnanJukker/MuleGraph.git
git log --oneline     -> 09465c4 feat: initialize project structure ...
```

All files matched the placeholder state described in the task brief (plus one
untracked-in-brief placeholder, `docs/handoffs/foundation.md`, noted above). No newer
substantive work was found to be at risk of being overwritten.

Git identity check:

```
git config user.name  -> AdnanJukker
git config user.email -> adnanjukker402@gmail.com
```

Present and usable — no blocker.

Branch creation:

```
git checkout -b feat/ml-foundation   -> Switched to a new branch 'feat/ml-foundation'
```

Validator — canonical run from repo root:

```
python scripts/validate_demo.py
-> OK: canonical demo fixtures valid (6 accounts, 7 transactions, 7 edges)
-> exit code 0
```

Validator — canonical run from a different working directory (`/`, i.e. outside the
repo), using an absolute script path and default (script-relative) fixture paths:

```
python /d/MuleGraph/scripts/validate_demo.py
-> OK: canonical demo fixtures valid (6 accounts, 7 transactions, 7 edges)
-> exit code 0
```

Validator — six corrupted/missing fixture variants, built in the session scratchpad
(never touching the tracked canonical files), each run with `--transactions` or
`--graph` pointing at the corrupted copy:

| Case | Result | Exit |
| --- | --- | --- |
| Duplicate transaction ID (`TX_002` id changed to `TX_001`) | `FAIL: transaction 'TX_001': duplicate transaction id` | 1 |
| Graph edge referencing unknown node `ACC_Z` | `FAIL: graph edge 'TX_007': 'target' 'ACC_Z' does not reference a known node (dangling edge)` | 1 |
| Boolean amount (`"amount": true`) | `FAIL: transaction 'TX_001': 'amount' must be a positive integer (not a boolean), got True` | 1 |
| Invalid calendar date (`2026-02-30`) | `FAIL: transaction 'TX_001': timestamp '2026-02-30T10:00:00Z' is not a valid UTC 'YYYY-MM-DDTHH:MM:SSZ' value (day 30 must be in range 1..28 for month 2 in year 2026)` | 1 |
| Mismatched edge amount vs. source transaction (99999 vs 14000) | `FAIL: transaction 'TX_007': graph edge 'amount' 99999 does not match transaction 'amount' 14000` | 1 |
| Missing transactions file | `FAIL: transactions file not found: <path>` | 1 |

After these test runs, the canonical files were re-validated and confirmed unchanged
and still passing (`git status` showed no modification to `data/*.json` from the test
runs — the corrupted copies lived only in the scratchpad directory).

Environment inspection commands (read-only, nothing installed):

```
python --version / py --version   -> Python 3.14.6
where python / where py           -> C:\Python314\python.exe (+ shims)
python -m pip list                -> full package list captured (see docs/ml/environment.md)
python -c "import torch; ..."     -> torch 2.14.0+cpu; torch.cuda.is_available() == False
Get-CimInstance Win32_OperatingSystem / Win32_ComputerSystem / Win32_VideoController
nvidia-smi                        -> ran successfully, GTX 1650, driver 32.0.16.1088, 4096 MiB
```

Full detail in `docs/ml/environment.md`.

## 3. Canonical fixture counts and validation outcome

- 6 accounts: `ACC_VICTIM`, `ACC_A`, `ACC_B`, `ACC_C`, `ACC_D`, `ACC_X`.
- 7 transactions / 7 edges: `TX_001`..`TX_007`, matching the fan-out
  (`ACC_VICTIM -> ACC_A -> {ACC_B, ACC_C, ACC_D}`) then convergence
  (`{ACC_B, ACC_C, ACC_D} -> ACC_X`) scenario from the brief, exact amounts and
  timestamps as specified.
- `data/graph.example.json` nodes sorted by `id`; edges sorted by `(timestamp, id)`.
- All `risk_score` fields `null`, all `risk_level` fields `"UNASSESSED"`.
- Validator confirms: required fields/types, unique nonempty IDs, positive integer
  amounts (booleans rejected), valid UTC timestamps (calendar-checked), exact match to
  the canonical scenario, no dangling edges, and exact field-by-field agreement
  between `graph.example.json` edges and `demo_transactions.json` records.

## 4. Environment observations and unknowns

See `docs/ml/environment.md` for full detail. Headline points:

- Global Python 3.14.6, no project-local virtual environment yet.
- 15.34 GB RAM.
- GPU: NVIDIA GeForce GTX 1650, ~4 GB dedicated VRAM, driver present, `nvidia-smi`
  works. A second, integrated AMD GPU is present but not relevant to training.
- **Installed `torch` is a CPU-only build (2.14.0+cpu); `torch.cuda.is_available()`
  is `False`.** The driver's reported CUDA capability does not mean a working
  CUDA-enabled PyTorch install exists — it doesn't, yet.
- `xgboost` and PyTorch Geometric are not installed anywhere on this machine.
- Various unrelated ML/NLP packages (`transformers`, `sentence-transformers`,
  `datasets`, `openai`, etc.) are already present globally, apparently from other
  work — not something this task installed or relies on.
- Unknowns for Stage 2/3: actual CUDA toolkit version if any, whether a CUDA-enabled
  torch wheel will install and pass a real device check on this driver, current
  official compatibility matrices at the time Stage 2/3 actually starts, and whether
  4 GB VRAM is sufficient for the eventual GraphSAGE batch size.

## 5. Shared-document repairs for Ashmi to review

`docs/api-contract.md` and `docs/milestone-1.md` were still literal one-line
placeholders (`# API Contract`, `# Milestone 1`), so I populated them per the explicit
authorization in the task brief, rather than leaving shared contract docs empty while
building fixtures against an implied contract. Please review both:

- `docs/api-contract.md` documents `GET /health`, `GET /api/graph`, the node/edge
  shapes, sort order, and the empty-vs-error response rules. This is what the
  fixtures and validator assume; if backend needs the actual contract to differ,
  that's a real conflict to resolve, not a rubber-stamp.
- `docs/milestone-1.md` documents the end-to-end gate checklist from the handoff
  brief, explicitly marked **not yet met** — no item is checked off, since none of the
  frontend/backend integration has been built or verified.

If either file already had a different substantive contract elsewhere (e.g. in a
design doc I didn't see), please flag the conflict rather than assuming my draft wins.

## 6. What Smit and Adnan can consume now

- Smit: `data/demo_transactions.json` is the transaction source to build
  `GET /api/graph` against; `docs/api-contract.md` documents the exact expected
  request/response shapes, sorting, and error behavior (including the "no silent
  fixture fallback on error" requirement from the milestone gate).
- Adnan (frontend): `data/graph.example.json` is ready to use as a static dev fixture
  for `react-force-graph-2d` work before the real endpoint exists — it's already in
  the exact contract shape.
- Both: `python scripts/validate_demo.py` can be run any time to confirm the fixtures
  are still internally consistent, e.g. after either file is hand-edited.

## 7. Remaining blockers and gate status

- **The Stage 0 work itself has no open blockers.** Validator runs clean on the
  canonical fixtures from the repo root and from another working directory; git
  identity is configured; no conflicting work was found or overwritten.
- **The Milestone 1 end-to-end gate (`docs/milestone-1.md`) is pending**, not done —
  no FastAPI or Next.js implementation work was performed or claimed in this stage,
  per explicit scope limits. Every checklist item there is unchecked.
- **Stage 1 (rules/replay) has not started**, per explicit instruction to stop after
  Stage 0 and wait for the next request.
- No training frameworks, XGBoost, or GraphSAGE-related code or dependencies were
  installed or added, per scope.

## Commit

Only the files listed in section 1 were staged and committed on `feat/ml-foundation`.
The branch was not pushed and no PR was opened, per instruction to commit locally only
unless explicitly asked to push.
