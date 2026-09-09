# MuleGraph Explainable Detection Patterns Specification

> **Module:** `ml/rules`  
> **Version:** 1.1.0  
> **Scope:** Algorithmic criteria, measurable signals, explainability standards, and false-positive counterexample guidelines for all deterministic rules.

---

## 1. Overview & Architectural Principles

MuleGraph rules provide **deterministic, CPU-only, explainable detection** of coordinated money mule typologies. Unlike black-box neural networks, every finding produced by this engine:
1. Surfaces **concrete evidence transaction IDs** proving the pattern.
2. Emits **quantitative measured signals** (velocities, retention ratios, hop latencies, inactivity durations).
3. Produces a **plain-language natural explanation** enabling an analyst or regulator to understand *why* the alert was triggered.
4. Strictly adheres to **point-in-time replay safety** (zero future leakage).
5. Provides explicit **cross-rule alert deduplication** to eliminate alert fatigue.

---

## 2. Common Finding Schema

Every detector outputs instances of the unified `Finding` dataclass ([`ml/rules/detector.py`](file:///d:/Mule_Graph/ml/rules/detector.py)):

| Field | Type | Description |
|---|---|---|
| `pattern` | `str` | Typology identifier (`"fan_out_convergence"`, `"circular_transfer"`, `"rapid_forwarding"`, `"fan_in_collector"`, `"dormant_reactivation"`). |
| `involved_accounts` | `tuple[str, ...]` | Chronologically ordered accounts participating in the network pattern. |
| `evidence_transaction_ids` | `tuple[str, ...]` | Transaction IDs providing factual grounding for this alert. |
| `window_start` | `datetime` | UTC timestamp of the earliest evidence transaction. |
| `window_end` | `datetime` | UTC timestamp of the latest evidence transaction. |
| `measured_signals` | `dict` | Key-value pairs of quantitative signals (latencies, volumes, ratios). |
| `rule_version` | `str` | Semantic rule version (e.g. `"1.0.0"`). |
| `explanation` | `str` | Natural-language explanation of the alert rationale. |
| `score` | `float` | Heuristic evidence-strength ranking in `[0.0, 1.0]`. **Not a calibrated probability.** |
| `score_method` | `str` | Formula description of the heuristic score. |

*(Legacy fields `source_account`, `collector_account`, `intermediary_accounts`, `fan_out_transaction_ids`, `convergence_transaction_ids`, and `evidence` are automatically populated for backward compatibility).*

---

## 3. Typology Specifications & Counterexamples

### 1. Fan-Out $\rightarrow$ Convergence (`fan_out_convergence`)
- **Topology:** Single source $S \rightarrow \ge 3$ intermediaries $I_1, I_2, I_3 \rightarrow$ single collector $C$.
- **Laundering Intent:** Classic rapid layering and consolidation of stolen funds across temporary mules.
- **Configurable Thresholds:**
  - `min_intermediaries`: $\ge 3$ distinct intermediaries on both fan-out and convergence legs.
  - `fan_out_window_seconds`: 60s (Demo) / 21,600s (AML 6h).
  - `convergence_window_seconds`: 60s (Demo) / 21,600s (AML 6h).
- **Suspicious Example:**
  - `ACC_VICTIM` sends ₹50k to `ACC_A`. `ACC_A` disperses ₹15k, ₹14k, ₹16k to `ACC_B`, `ACC_C`, `ACC_D` in 10s. Within 11s, `ACC_B`, `ACC_C`, `ACC_D` forward ₹13k, ₹12k, ₹14k into `ACC_X`.
- **Legitimate Counterexample (Ordinary Business Activity):**
  - A small contractor receives a project milestone deposit and pays 3 subcontractors for parts and labor, and those 3 subcontractors buy supplies from the same major regional hardware distributor.
- **False-Positive Mitigation:**
  - Check commercial merchant registrations; look at time window (days vs. seconds); verify corporate tax IDs.

---

### 2. Circular Transfer Loops (`circular_transfer`)
- **Topology:** Closed loop $A_0 \rightarrow A_1 \rightarrow \dots \rightarrow A_{k-1} \rightarrow A_0$ returning funds to the originator.
- **Laundering Intent:** Wash trading, artificial volume inflation, round-tripping to fabricate business turnover, or testing mule availability.
- **Configurable Thresholds:**
  - `min_cycle_length`: $\ge 2$ hops (e.g. $A \rightarrow B \rightarrow A$ or $A \rightarrow B \rightarrow C \rightarrow A$).
  - `max_cycle_length`: $\le 5$ hops.
  - `max_hop_delay_seconds`: 60s (Demo) / 14,400s (AML 4h).
  - `max_cycle_duration_seconds`: 300s (Demo 5m) / 86,400s (AML 24h).
  - `min_amount_retention_ratio`: $\ge 70\%$ fund retention.
- **Suspicious Example:**
  - $A \rightarrow B$ (₹50,000 at 10:00:00) $\rightarrow C$ (₹49,000 at 10:00:10) $\rightarrow A$ (₹48,000 at 10:00:25). 96% retention within 25 seconds across 3 accounts without any economic goods exchanged.
- **Legitimate Counterexample (Ordinary Business Activity):**
  - **E-Commerce Refund / Order Cancellation:** Customer purchases goods from Merchant online. Two days later, Customer returns item, and Merchant issues a full refund back to Customer's bank account.
- **False-Positive Mitigation:**
  - E-commerce refunds typically span several days (far exceeding the 60s/300s high-velocity thresholds) and carry reference memo tags (e.g., `REFUND`, `REVERSAL`).

---

### 3. Rapid Forwarding Chains (`rapid_forwarding`)
- **Topology:** Linear relay chain $A \rightarrow B \rightarrow C \rightarrow D$ without cycles.
- **Laundering Intent:** Multi-hop peeling / layering designed to distance funds from the source across multiple banking institutions before law enforcement freeze orders take effect.
- **Configurable Thresholds:**
  - `min_hops`: $\ge 3$ hops (4 distinct accounts).
  - `max_hops`: $\le 6$ hops.
  - `max_hop_delay_seconds`: 60s (Demo) / 14,400s (AML 4h).
  - `min_pass_through_ratio`: $\ge 75\%$ forwarded at each hop.
  - `max_chain_duration_seconds`: 300s (Demo) / 86,400s (AML 24h).
- **Suspicious Example:**
  - $P \rightarrow Q$ (₹100k) $\rightarrow R$ (₹98k) $\rightarrow S$ (₹96k) $\rightarrow T$ (₹94k) moving across 4 institutions in under 40 seconds with minimal friction and 94% retention.
- **Legitimate Counterexample (Ordinary Business Activity):**
  - **Commercial Supply Chain / Escrow Settlement:** Buyer pays Marketplace Escrow $\rightarrow$ Escrow settles Seller balance $\rightarrow$ Seller pays Wholesale Distributor $\rightarrow$ Distributor pays logistics carrier.
- **False-Positive Mitigation:**
  - Commercial supply chains occur over days or weeks, align with standard business hours, and involve verified commercial corporate accounts with high baseline balances rather than near-zero balance retail mules.

---

### 4. Fan-In Collector Activity (`fan_in_collector`)
- **Topology:** Multiple distinct senders $S_1, S_2, \dots, S_n \rightarrow$ single collector account $C$.
- **Laundering Intent:** Smurfing consolidation from micro-mules, pooling proceeds from phishing campaigns, or gathering criminal funds into a master exit account.
- **Configurable Thresholds:**
  - `min_senders`: $\ge 3$ distinct source accounts.
  - `fan_in_window_seconds`: 60s (Demo) / 21,600s (AML 6h).
  - `min_total_amount`: Minimum total aggregated volume.
- **Suspicious Example:**
  - Personal savings account `ACC_X` receives 5 rapid transfers of ₹10,000 from 5 completely unrelated individuals within 90 seconds, followed immediately by full cash withdrawal.
- **Legitimate Counterexample (Ordinary Business Activity):**
  - **Shared Social Expense (Dinner / Rent Split):** 3 roommates split ₹3,000 restaurant dinner or ₹30,000 monthly apartment rent, transferring funds via UPI to one person who settled the bill.
- **False-Positive Mitigation:**
  - Set appropriate `min_total_amount` thresholds; check recurring monthly schedules (e.g. rent on the 1st of the month); verify prior social transfer graph between the individuals.

---

### 5. Unusual Dormancy Reactivation (`dormant_reactivation`)
- **Topology:** Account idle for $\ge T_{dormant}$, immediately followed by an anomalous burst of transactions within $T_{burst}$.
- **Laundering Intent:** Pre-aged "sleeper" mule accounts activated on demand; stolen credentials used to liquidate forgotten accounts.
- **Configurable Thresholds:**
  - `min_dormancy_seconds`: 3,600s (1 hour for unit tests) / 2,592,000s (30 days for enterprise AML).
  - `burst_window_seconds`: 60s (Demo) / 86,400s (AML 24h).
  - `min_burst_tx_count`: $\ge 1$ transaction.
  - `min_surge_amount`: Minimum volume threshold.
  - `surge_ratio_threshold`: $\ge 2.0\times$ prior average transaction volume.
- **Suspicious Example:**
  - A retail account with no activity for 9 months suddenly receives ₹300,000 at 2:30 AM and immediately forwards ₹290,000 to three crypto P2P sellers in 45 seconds.
- **Legitimate Counterexample (Ordinary Business Activity):**
  - **Seasonal Agriculture / Tax Consultant:** An agricultural cooperative or seasonal tax advisory account remains quiet for 8 months and reactivates during harvest or tax season to receive payments.
  - **Annual Insurance / Bonus Payout:** Customer receives an annual insurance claim settlement or corporate bonus into an infrequently used secondary bank account.
- **False-Positive Mitigation:**
  - Check payer identity (e.g. verified corporate/insurance/government payer); verify whether the inbound funds are immediately fragmented and forwarded vs. retained as savings.

---

## 4. Replay Safety & Alert Deduplication

### Point-in-Time Replay Safety
All detectors evaluate strictly against causal snapshots filtered via `observable_transactions(transactions, as_of)`. Under no circumstances can any rule observe transactions occurring after `as_of`. Dormancy detection looks backward into historical activity prior to the event, never forward.

### Cross-Rule Deduplication
When multiple detectors run concurrently via `detect_all_patterns`:
- If `ACC_X` receives converging funds as the final stage of a `fan_out_convergence` finding, a redundant standalone `fan_in_collector` finding for the exact same collector and transaction set is suppressed.
- Redundant overlapping sub-chains are collapsed into the maximal forwarding chain.
- Cyclic paths are deduplicated by unique transaction sets to emit only the highest-scoring canonical loop alert.
