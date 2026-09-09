MuleGraph: analysis of the current working tree
=============================================

Analysis date: 2026-09-10. Scope: application entry points, backend routes and services, frontend state and data flow, deterministic detection, model training/inference, deployment, and available tests. This describes the files currently on disk, including substantial uncommitted work. It is not an analysis of a clean checkout. No application code was changed during this review.

**Overall assessment**

MuleGraph is a functioning analyst-demo application built around transaction graphs and explainable deterministic evidence. It has two separately integrated XGBoost classifiers and an isolated GraphSAGE experiment. Its strongest foundation is the small canonical transaction scenario, validation, and explicit score semantics. Its main weakness is incomplete integration between newer modules: the multi-pattern engine, live events, case service, and investigator UI do not yet form one coherent end-to-end system.

The backend has no database, authentication layer, or durable event log. Browser investigation actions are simulated. Those boundaries matter when deciding whether a feature is implemented, merely present as a module, or ready for operational use.

**Repository and ownership of behavior**

| Area | Responsibility | Main entry points |
| --- | --- | --- |
| `frontend/app` | Four current routes: overview, investigator, AML dataset, card-fraud tool | `page.tsx`, `investigator/page.tsx`, `aml/page.tsx`, `tools/xgb-score/page.tsx` |
| `frontend/components` | Graph rendering, inspectors, forms, investigation workspace, application shell | `overview/OverviewView.tsx`, `investigator/InvestigatorConsole.tsx`, `shell/AppShell.tsx` |
| `frontend/lib/store` | In-memory Zustand state for console, assessment, and AML workflows | `consoleStore.ts`, `assessmentStore.ts`, `amlStore.ts` |
| `frontend/lib/services` | API validation/mapping, graph construction, local rules, derived alerts/cases | `apiClient.ts`, `graphBuilder.ts`, `rules/`, `investigatorScenario.ts` |
| `backend/app` | FastAPI application, Pydantic contracts, services, ML adapters | `main.py`, `schemas.py`, `config.py` |
| `ml/rules` | Framework-independent deterministic detectors and replay | `detector.py`, `engine.py`, `replay.py`, `account_risk.py` |
| `ml/aml_baseline` | IBM synthetic AML transaction classifier | `features.py`, `train.py`, `inference.py` |
| `ml/xgb_baseline` | Separate anonymized credit-card fraud classifier | `features.py`, `train.py`, `inference.py` |
| `ml/experiments/graphsage` | Offline neural-network benchmark | `model.py`, `temporal_sampler.py`, `train.py` |
| `scripts` and `data` | Fixture validation and explicit dataset preparation | `validate_demo.py`, `prepare_aml_dataset.py` |

The frontend manifest specifies Next.js 16.3.4, React 19.2.8, Zustand 5, Tailwind 4, Radix/shadcn components, Recharts, and react-force-graph-2d. The backend is FastAPI/Pydantic with Uvicorn. Rules remain independent of the optional pandas/XGBoost and PyTorch stacks.

**Canonical execution path**

```text
data/demo_transactions.json
  -> GET /api/graph
  -> services/graph.py: load, validate, build graph
  -> adapters/ml_rules.py: convert to ML Transaction records
  -> replay.evaluate_at(latest transaction timestamp)
  -> detect_fan_out_convergence
  -> account_risk_from_findings
  -> nodes + directed transaction edges + findings
  -> frontend API validation and mapping
  -> consoleStore -> useConsoleData -> graph/alerts/metrics/inspectors
```

Every graph request rereads the tiny fixture. Nodes are deduplicated by account ID; transactions remain individual directed edges, including repeated account pairs. Nodes sort by ID and edges by timestamp/ID. IDs are identities, not predictive features; canonical display labels are applied separately.

`POST /api/assess` accepts up to 500 canonical-schema transactions, rejects duplicate IDs with HTTP 409, validates positive integer rupee amounts and timestamps, and uses the same rules adapter. It returns account risk, patterns, and review candidates. It does not ingest transactions into a server graph or modify the fixture. It does publish an operational event and record timing, so it is stateless with respect to transaction storage, rather than literally free of all side effects.

The default frontend mode is simulation. It uses a bundled copy of the canonical fixture and a TypeScript implementation of the fan-out detector. Replay reveals transaction prefixes. Live mode reads the backend snapshot and findings; it does not turn the demo into a bank transaction feed. Failed live fetches clear the graph and show errors instead of silently substituting demo data. Abort controllers prevent superseded live requests from overwriting newer results.

**What the core detector actually proves**

The canonical transfer sequence is:

```text
Victim --50,000--> A
                   |--15,000--> B --13,000--|
                   |--14,000--> C --12,000--|--> X
                   |--16,000--> D --14,000--|
```

The detector finds a source sending to at least three intermediaries within a 60-second fan-out window, followed by strictly later transfers from those intermediaries to a common collector within 60 seconds of receipt. The collector must differ from the source and intermediaries. Duplicate transaction IDs do not inflate evidence. Findings for the same source/collector/intermediary set retain the strongest candidate.

The score is:

```text
0.5 * intermediary_ratio
+ 0.3 * min(1, convergence_amount / fan_out_amount)
+ 0.2 * max(0, 1 - min(1, pattern_duration / 120 seconds))
```

Direct execution produced one finding with score **0.9317**, fan-out total **45,000 INR**, convergence total **39,000 INR**, and a **17-second** evidence window. A, B, C, D, and X receive HIGH risk; the victim remains UNASSESSED because its initial deposit is not part of the matched pattern. The score ranks evidence strength. It is not a 93.17% probability of fraud, and matching the pattern does not establish criminal intent.

Account risk is the maximum finding score across that account's findings. Thresholds are HIGH at 0.75 and MEDIUM at 0.4; lower scored findings map to LOW. Accounts absent from findings have null scores and UNASSESSED status. Roles and transaction evidence are retained separately from the score.

Python also implements circular transfers, rapid forwarding chains, fan-in collection, and dormant reactivation. `engine.detect_all_patterns` orchestrates them, with demo/AML presets and exact-evidence fan-in/convergence deduplication. `replay.evaluate_all_at` is the temporal entry point. **Neither graph adapter currently calls it**: both still use `evaluate_at`, which invokes fan-out/convergence alone. Activating the engine also requires updating API and frontend finding shapes, which are still built around fan-out phases.

**Frontend state and investigation semantics**

`useConsoleData` normalizes the overview's data into one active dataset, with precedence:

```text
completed assessment > live snapshot > simulation replay
```

Alerts, cases, metrics, graph, and transactions derive from that selection. Assessment responses omit some replay-finding fields, so assessment mode intentionally has no derived findings for the standard alerts/cases lists; its pattern evidence appears through the assessment result panel instead. This is an interface limitation to consider when building a unified case workflow.

The console store holds playback, account/transaction selection, filters, notes, simulated flags/freezes, and activity history. These are browser-memory values. They do not call `/api/cases` and are not durable across a reload. The backend case service is a separate in-memory implementation.

The investigator route is another distinct data path: `buildInvestigatorScenario()` always rebuilds the complete bundled canonical fixture. It does not consume the current live graph or assessment. Its strict policy sums detector-evidence transfer amounts, **84,000 INR**; its permissive policy sums every transfer touching the network, **134,000 INR**. These are cumulative transfer volumes across multiple hops, not unique principal or confirmed loss. The initial entering principal is 50,000 INR.

The copilot uses fixed, evidence-filled templates. Suggested questions receive deterministic answers with evidence references; arbitrary text has no connected language model. This is a useful explainability interface, but there is no LLM inference integration.

**AML data and model path**

The IBM synthetic AML extension is intentionally separate from the canonical demo. Canonical amounts are whole rupees; AML amounts are integer paise. AML timestamps have minute precision with UTC assumed because the source timezone is unspecified. Supported transfers are INR ACH/Wire.

The preparation script verifies the source checksum, converts money using Decimal with exact paise conversion, separates labels from runtime transaction fields, and creates chronological training/validation/test exports. Preparation and training are explicit offline commands.

The backend caches the base dataset per process and merges it with process-local committed transactions. Listing uses offset pagination. Graph views construct a bounded BFS neighborhood, defaulting to the largest-degree hub. Rules score only the returned edges, with six-hour fan-out and convergence windows and a 24-hour scoring scale. Consequently, AML graph risk depends on the selected neighborhood and edge/node caps; it is not a whole-dataset account verdict.

`POST /api/aml/assess` scores up to 100 proposed transactions against history without committing them. The AML classifier uses 35 features: amount/payment/time values, prior pair interactions, account activity and inactivity, and sender/receiver incoming/outgoing counts, counterparties, and amounts over one-hour and 24-hour windows. History is strictly earlier than the target minute. Batch targets are processed chronologically, so later targets can observe earlier batch targets; same-minute targets cannot observe each other. Responses preserve request order and return the actual feature values used.

`POST /api/aml/session/transactions` is the separate commit step. Its state disappears when the backend restarts and is shared across users of that process.

The checked-in AML report records 16,666 training rows with 83 positives, 5,345 validation rows with 25 positives, and 5,479 test rows with 18 positives. At validation-selected threshold 0.87, test precision is 0.6667, recall 0.2222, F1 0.3333, and PR-AUC 0.2438: four true positives, two false positives, and fourteen false negatives. Those are saved evaluation results, not a new training run from this review. The small positive count sharply limits inference about performance outside this benchmark.

The card-fraud XGBoost endpoint accepts the unrelated anonymized V1–V28 card features plus its amount/time inputs. Its reported performance cannot stand in for mule-network performance. Model artifacts load lazily; missing optional models produce explicit unavailability rather than silently changing the scoring method.

GraphSAGE exists as an isolated experiment and is not imported into application inference. A code-level caveat: its second layer receives each node's own first-layer representation as both self and neighbor input (`sage2(h_src, h_src)`). It does not aggregate independently computed second-hop neighbors. Results describe that implemented experiment; they should not be treated as a general evaluation of two-hop GraphSAGE. The evaluation document also contains differing latency estimates and later measurements that need reconciliation.

**Backend API surface**

| Endpoint | Current role |
| --- | --- |
| `GET /health` | Process liveness |
| `GET /health/ready` | Dependency/file readiness checks |
| `GET /api/graph` | Canonical graph and fan-out findings |
| `POST /api/assess` | Stateless canonical-schema rules assessment |
| `POST /api/xgb-score` | Optional card-fraud inference |
| `GET /api/aml/summary` | Dataset metadata and model availability |
| `GET /api/aml/transactions` | Filtered/paginated AML records |
| `GET /api/aml/graph` | Bounded AML neighborhood and rules output |
| `POST /api/aml/assess` | Optional AML model assessment |
| `POST /api/aml/session/transactions` | Process-local AML commit |
| `GET /api/events` | SSE notifications |
| `GET /api/events/poll` | Event polling |
| `GET /api/cases`, `GET /api/cases/{id}` | Process-local case reads |
| `POST /api/cases/{id}/status` | Case creation/update and optional note |
| `GET /api/operations/metrics` | Process-local timings/counters |

There is no persistent canonical ingestion endpoint, database-backed case store, WebSocket transport, or authenticated identity boundary in the inspected implementation.

**Verified gaps and risks, in implementation order**

1. **New capabilities are not wired through the product.** Four extra rules are not used by backend scoring. Searches across frontend application/components/hooks/services found no consumer mounting `useLiveUpdates` or `ConnectionStatusBadge`; only their declarations exist. No frontend `/api/cases` calls were found. Complete one vertical flow through API contracts, stores, UI, and integration tests before describing these as live product features.

2. **Frontend lint currently fails.** Eight explicit-any errors occur in `liveUpdates.ts`, its tests, and `types/event.ts`; two unused-variable warnings also occur. CI's frontend job runs lint, so its configured gate would fail on this working tree even though unit tests and type checking pass.

3. **Event delivery has correctness risks.** Synchronous API handlers publish directly into asyncio queues without an event-loop handoff. Replay is read before a live subscription is registered, leaving an event-loss window. Full subscriber queues silently discard events. Process restarts reset IDs, but a resume ID beyond the new latest ID returns no resync indication. These are code-review findings; this review did not perform a concurrent live-stream stress test.

4. **Polling/reconnect behavior is incomplete.** The client uses polling only if EventSource is unavailable; an EventSource-capable browser whose SSE traffic is blocked repeatedly retries SSE. On polling buffer overflow, it requests a state refresh without advancing its cursor to `latest_event_id`, which can repeat the same resync indefinitely. Fix cursor and stream-epoch semantics together with server replay/subscription behavior.

5. **Workspace labels are not access control.** The event endpoint accepts a wildcard workspace and any name starting with `ws_`, without authenticated ownership. Cases are keyed only by case ID, not workspace; the workspace only scopes the notification. AML session state is global. If multiple analysts or tenants are intended, identity, storage isolation, and authorization need a concrete design.

6. **Case lifecycle validation is absent.** Status is an unrestricted string and unknown IDs are automatically created with empty account lists and an unknown pattern. A direct service check accepted `not_a_valid_status`. Introduce a validated status enum, allowed transitions, and a consistent connection to detected evidence before connecting the UI.

7. **AML commits are not atomic.** The duplicate-ID check and append occur separately, with no lock or transaction around the batch. Concurrent requests can both pass the check and append the same ID. Process-local memory also means multiple workers would have divergent sessions, cases, and event buffers. This was identified from code, not reproduced with concurrent load.

8. **Readiness contradicts optional AML mode.** `/health/ready` treats an absent AML dataset as a hard failure even when Docker's `AML_MODE=optional` allows the canonical application to start. Model checks use `parents[3] / 'ml'`, which resolves under `backend/ml`, rather than repository `ml`. Checks mostly establish file existence, not data/model validity. Docker checks `/health` and the frontend home page, not this readiness endpoint.

9. **AML automatic seed metadata is wrong.** The BFS correctly chooses a hub, but returns `seed_account=account` instead of the computed `seed`. Direct execution returned null for an automatically chosen 40-node neighborhood. Return the actual selected seed and cover it with a focused assertion.

10. **Metrics are narrower than their comments suggest.** Raw request paths remain unnormalized, so arbitrary case IDs create new metric keys. Unhandled exceptions bypass the middleware's recording statement. A 500-sample analysis deque reports its retained length as count, not a lifetime total. Event-buffer size is labeled alongside backlog, but it is retained history rather than pending analysis jobs.

11. **Documentation is materially stale.** The root README still mentions five layouts that have been removed. `ml/README.md` says there is no integration or GraphSAGE code, contradicting the current tree. Several backend status paragraphs predate new routes. Use current code and executable checks as the starting point, then update the implementation map and docs together.

Additional maintainability concerns: Python and TypeScript duplicate the core detector; AML preparation and inference maintain separate feature implementations; both require parity protection. AML list/graph requests repeatedly merge/sort history and reconstruct adjacency, which is reasonable for the demo size but should be profiled before claiming scale. Dataset loading does not consistently translate all parsing/validation exceptions into the advertised dataset error response.

**Deployment behavior**

Root Compose builds one container containing both Node and Python. The entrypoint starts Uvicorn and the Next standalone server and restarts the container if either process dies. It runs as a non-root user and publishes both ports to host loopback. Separate frontend/backend Docker configurations also exist.

Optional artifacts are copied when present; the entrypoint does not download data or train models. No shared database or persistent state volume exists in root Compose. Configuration resolves process environment over `backend/.env` over defaults. Only explicitly recognized variables enter the backend settings loader; `AML_MODE` is an entrypoint setting, not part of backend readiness configuration.

**Verification performed**

| Check | Result |
| --- | --- |
| Canonical fixture validator | Passed: six accounts, seven transactions/edges |
| Backend pytest suite | 126 passed; two dependency deprecation warnings |
| Python deterministic rules suite | 51 passed |
| AML model suite | 29 passed |
| Card-fraud model suite | 20 passed |
| Frontend Vitest | 109 passed across 13 files |
| TypeScript `--noEmit --incremental false` | Passed |
| Frontend ESLint | Failed: eight errors, two warnings |
| Direct canonical graph execution | Confirmed 0.9317 finding and account risk mapping |
| Direct service probes | Confirmed null auto-selected AML seed and unrestricted case status |

The first backend run hit sandbox access restrictions on pytest's temporary directory; the rerun with access passed. PowerShell blocked npm.ps1, so frontend checks used npm.cmd. The lint command and subsequent TypeScript command ran sequentially; the shell's final successful status reflects TypeScript and does not mean lint passed.

This review did not rebuild Docker, launch a browser session, run Playwright, retrain either classifier, or rerun the GraphSAGE benchmark. Existing browser-test configuration uses isolated ports and fresh server processes, but its current end-to-end result remains unverified here. Passing unit/service suites does not resolve the disconnected UI integrations identified above.

**Recommended next milestone**

Stabilize the current fan-out workflow first: clear lint, settle a common evidence contract, make investigator data selection explicit, and choose a single case-state owner. Then integrate the additional detectors through that contract, fix event delivery/cursors and mount the live client, and add browser coverage for those exact flows. Add durable and isolated storage before running multiple workers or supporting multiple analysts. Keep model targets and score meanings separate throughout. Further GNN investment should follow better domain evaluation and a corrected benchmark implementation, not precede the integration work.
