/**
 * Replay: evaluate the detector using only transactions observable at a
 * given point in time. Mirrors ml/rules/replay.py -- the structural
 * guarantee is the same: a snapshot "as of" some instant can never see a
 * transaction that happens after it.
 */

import { detectFanOutConvergence, type DetectorConfig, type Finding } from "./detector";
import { sortTransactions, type RuleTransaction } from "./transaction";

export function observableTransactions(
  transactions: readonly RuleTransaction[],
  asOfMs: number,
): RuleTransaction[] {
  return sortTransactions(transactions.filter((t) => t.timestampMs <= asOfMs));
}

/**
 * The only supported way to score "as of" a point in time: filters to
 * observable transactions first, then detects, so a caller cannot
 * accidentally leak future transactions into an earlier snapshot's findings.
 */
export function evaluateAt(
  transactions: readonly RuleTransaction[],
  asOfMs: number,
  config?: DetectorConfig,
): Finding[] {
  const snapshot = observableTransactions(transactions, asOfMs);
  return detectFanOutConvergence(snapshot, config);
}
