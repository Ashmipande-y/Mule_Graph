/**
 * Deterministic fan-out -> convergence detector.
 *
 * This is a line-for-line TypeScript port of ml/rules/detector.py, kept
 * intentionally faithful (same thresholds, same score formula, same
 * tie-breaking) so client-side replay produces exactly the same evidence
 * the backend would for the same observable transaction set. It has no
 * knowledge of any specific account id or the demo fixture -- every account
 * id it sees comes from the transactions passed in.
 *
 * The `score` this module produces is a hand-defined heuristic combining
 * three observable ratios. It is NOT a calibrated probability of fraud, NOT
 * a trained model's output, and NOT a measured performance metric -- treat
 * it as a heuristic ranking key, same as ml/rules/detector.py's docstring.
 */

import {
  compareTransactions,
  deduplicateById,
  formatUtcSeconds,
  type RuleTransaction,
} from "./transaction";

export interface DetectorConfig {
  /** Minimum distinct intermediaries required on both sides for a candidate group to be reported at all. */
  minIntermediaries: number;
  /** A fan-out group is a source account's outgoing transactions within this many seconds of the group's first transaction. */
  fanOutWindowSeconds: number;
  /** From when an intermediary receives a fan-out transaction, a subsequent outgoing transfer counts as convergence only within this many seconds. */
  convergenceWindowSeconds: number;
  /** Normalizes the time-compactness score term into [0, 1]; does not gate whether a finding is reported. */
  maxScoringWindowSeconds: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  minIntermediaries: 3,
  fanOutWindowSeconds: 60,
  convergenceWindowSeconds: 60,
  maxScoringWindowSeconds: 120,
};

export const SCORE_METHOD =
  "heuristic_v1 = 0.5*intermediary_ratio + 0.3*amount_conservation + 0.2*time_compactness, " +
  "clipped to [0, 1]. A hand-defined evidence-strength ranking score, not a calibrated " +
  "probability, not a trained model output, and not a measured performance metric.";

export interface Finding {
  pattern: "fan_out_convergence";
  sourceAccount: string;
  collectorAccount: string;
  intermediaryAccounts: string[];
  fanOutTransactionIds: string[];
  convergenceTransactionIds: string[];
  windowStart: string;
  windowEnd: string;
  score: number;
  scoreMethod: string;
  evidence: {
    intermediaryRatio: number;
    amountConservation: number;
    timeCompactness: number;
    totalFanOutAmount: number;
    totalConvergenceAmount: number;
    windowSpanSeconds: number;
    fanOutWindowSeconds: number;
    convergenceWindowSeconds: number;
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Yields candidate fan-out groups for one source account. `outgoing` must
 * already be sorted by timestamp. Each group is anchored at one starting
 * transaction and extends forward while still inside the fan-out window, so
 * overlapping windows starting at different transactions are all considered
 * as separate candidates (deduplicated later by the findings map key).
 */
function* fanOutGroups(
  source: string,
  outgoing: RuleTransaction[],
  config: DetectorConfig,
): Generator<Map<string, RuleTransaction[]>> {
  const n = outgoing.length;
  for (let i = 0; i < n; i++) {
    const windowEndMs = outgoing[i].timestampMs + config.fanOutWindowSeconds * 1000;
    const group: RuleTransaction[] = [outgoing[i]];
    for (let j = i + 1; j < n; j++) {
      if (outgoing[j].timestampMs > windowEndMs) break;
      if (outgoing[j].receiver === source) continue; // a transfer back to itself is not a fan-out edge
      group.push(outgoing[j]);
    }

    const byReceiver = new Map<string, RuleTransaction[]>();
    for (const tx of group) {
      const list = byReceiver.get(tx.receiver);
      if (list) list.push(tx);
      else byReceiver.set(tx.receiver, [tx]);
    }

    if (byReceiver.size >= config.minIntermediaries) yield byReceiver;
  }
}

/**
 * Detects fan-out -> convergence patterns in the given transactions.
 * Callers doing replay must pre-filter `transactions` to what was
 * observable at the evaluation time (see replay.ts's evaluateAt) -- this
 * function has no notion of "now" and uses every transaction it is given.
 */
export function detectFanOutConvergence(
  transactions: readonly RuleTransaction[],
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): Finding[] {
  const txs = deduplicateById(transactions); // duplicate input records must not inflate evidence

  const bySender = new Map<string, RuleTransaction[]>();
  for (const tx of txs) {
    const list = bySender.get(tx.sender);
    if (list) list.push(tx);
    else bySender.set(tx.sender, [tx]);
  }
  for (const list of bySender.values()) list.sort(compareTransactions);

  const findings = new Map<string, Finding>();

  for (const [source, outgoing] of bySender) {
    for (const fanOutByIntermediary of fanOutGroups(source, outgoing, config)) {
      const intermediaries = [...fanOutByIntermediary.keys()].sort();

      // For each intermediary, the fan-out transaction it is credited with
      // is the last one it received within this group (money must have
      // actually arrived before it can be forwarded on).
      const fanOutTxFor = new Map<string, RuleTransaction>();
      for (const m of intermediaries) {
        const list = fanOutByIntermediary.get(m)!;
        fanOutTxFor.set(m, list[list.length - 1]);
      }

      // collector -> intermediary -> earliest qualifying convergence tx
      const convergenceCandidates = new Map<string, Map<string, RuleTransaction>>();
      for (const intermediary of intermediaries) {
        const receivedAtMs = fanOutTxFor.get(intermediary)!.timestampMs;
        const latestAllowedMs = receivedAtMs + config.convergenceWindowSeconds * 1000;
        const senderTxs = bySender.get(intermediary) ?? [];
        for (const tx of senderTxs) {
          if (tx.timestampMs <= receivedAtMs) continue; // must be forwarded strictly after it was received
          if (tx.timestampMs > latestAllowedMs) continue;
          if (tx.receiver === source || fanOutByIntermediary.has(tx.receiver)) continue; // collector must be distinct from source and intermediaries

          let perIntermediary = convergenceCandidates.get(tx.receiver);
          if (!perIntermediary) {
            perIntermediary = new Map();
            convergenceCandidates.set(tx.receiver, perIntermediary);
          }
          const existing = perIntermediary.get(intermediary);
          if (!existing || tx.timestampMs < existing.timestampMs) {
            perIntermediary.set(intermediary, tx);
          }
        }
      }

      for (const [collector, perIntermediary] of convergenceCandidates) {
        if (perIntermediary.size < config.minIntermediaries) continue;

        const converging = [...perIntermediary.keys()].sort();
        const fanOutTxs = converging.map((m) => fanOutTxFor.get(m)!);
        const convergenceTxs = converging.map((m) => perIntermediary.get(m)!);

        const windowStartMs = Math.min(...fanOutTxs.map((t) => t.timestampMs));
        const windowEndMs = Math.max(...convergenceTxs.map((t) => t.timestampMs));
        const windowSpanSeconds = (windowEndMs - windowStartMs) / 1000;

        const totalFanOutAmount = fanOutTxs.reduce((sum, t) => sum + t.amount, 0);
        const totalConvergenceAmount = convergenceTxs.reduce((sum, t) => sum + t.amount, 0);

        const intermediaryRatio = converging.length / intermediaries.length;
        const amountConservation = totalFanOutAmount
          ? Math.min(1, totalConvergenceAmount / totalFanOutAmount)
          : 0;
        const timeCompactness = Math.max(
          0,
          1 - Math.min(1, windowSpanSeconds / config.maxScoringWindowSeconds),
        );

        let score = 0.5 * intermediaryRatio + 0.3 * amountConservation + 0.2 * timeCompactness;
        score = round4(Math.min(1, Math.max(0, score)));

        const key = `${source}|${collector}|${converging.join(",")}`;
        const candidate: Finding = {
          pattern: "fan_out_convergence",
          sourceAccount: source,
          collectorAccount: collector,
          intermediaryAccounts: converging,
          fanOutTransactionIds: fanOutTxs.map((t) => t.id),
          convergenceTransactionIds: convergenceTxs.map((t) => t.id),
          windowStart: formatUtcSeconds(windowStartMs),
          windowEnd: formatUtcSeconds(windowEndMs),
          score,
          scoreMethod: SCORE_METHOD,
          evidence: {
            intermediaryRatio: round4(intermediaryRatio),
            amountConservation: round4(amountConservation),
            timeCompactness: round4(timeCompactness),
            totalFanOutAmount,
            totalConvergenceAmount,
            windowSpanSeconds,
            fanOutWindowSeconds: config.fanOutWindowSeconds,
            convergenceWindowSeconds: config.convergenceWindowSeconds,
          },
        };

        const existing = findings.get(key);
        if (!existing || candidate.score > existing.score) {
          findings.set(key, candidate);
        }
      }
    }
  }

  return [...findings.values()].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.sourceAccount !== b.sourceAccount) return a.sourceAccount < b.sourceAccount ? -1 : 1;
    if (a.collectorAccount !== b.collectorAccount) return a.collectorAccount < b.collectorAccount ? -1 : 1;
    return 0;
  });
}
