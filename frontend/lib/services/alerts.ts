import type { Alert } from "@/types/alert";
import type { Transaction } from "@/types/transaction";
import type { Finding } from "./rules/detector";
import { riskLevelForScore } from "./rules/accountRisk";
import { labelFor } from "./labels";

/**
 * Builds a stable identity for a finding from its own evidence (source,
 * collector, intermediaries) rather than detection order or run identity --
 * see backend/README.md Stage 2: "Keep stable evidence-based alert identity."
 */
function alertId(finding: Finding): string {
  return `ALERT_${finding.sourceAccount}_${finding.collectorAccount}_${finding.intermediaryAccounts.join("-")}`;
}

/**
 * An alert becomes visible only once the transaction that completes its
 * evidence (the latest convergence transfer) is present in `revealedTransactions`
 * -- during replay (simulation) that means "revealed so far"; for a one-shot
 * dataset (live, or any other non-replay source) it means "present in this
 * snapshot at all," which every finding's evidence trivially satisfies since
 * the detector only ever produced findings from transactions in that same set.
 *
 * `isReplayPosition` controls whether `revealedAtStep` reports a real replay
 * step (simulation) or `null` (a one-shot snapshot has no meaningful "step
 * number" -- reporting one would misrepresent live data as replay progress).
 */
export function deriveAlerts(
  findings: readonly Finding[],
  revealedTransactions: readonly Transaction[],
  options: { isReplayPosition: boolean } = { isReplayPosition: true },
): Alert[] {
  const revealedIndexById = new Map(revealedTransactions.map((tx, index) => [tx.id, index]));

  return findings
    .map((finding) => {
      const completingTxId = [...finding.convergenceTransactionIds].sort((a, b) => {
        const ta = revealedTransactions.find((t) => t.id === a)?.timestamp ?? "";
        const tb = revealedTransactions.find((t) => t.id === b)?.timestamp ?? "";
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
      const revealedByTransactionId = completingTxId[completingTxId.length - 1];
      const stepIndex = revealedIndexById.get(revealedByTransactionId);

      const windowSpan = Math.round(finding.evidence.windowSpanSeconds);
      const alert: Alert = {
        id: alertId(finding),
        finding,
        level: riskLevelForScore(finding.score),
        revealedByTransactionId,
        revealedAtStep: options.isReplayPosition
          ? (stepIndex !== undefined ? stepIndex + 1 : revealedTransactions.length)
          : null,
        title: "Fan-out / convergence pattern detected",
        summary:
          `${labelFor(finding.sourceAccount)} fanned funds out to ${finding.intermediaryAccounts.length} ` +
          `account${finding.intermediaryAccounts.length === 1 ? "" : "s"}, which converged on ` +
          `${labelFor(finding.collectorAccount)} within ${windowSpan}s.`,
      };
      return alert;
    })
    .filter((alert) => revealedIndexById.has(alert.revealedByTransactionId))
    .sort((a, b) => b.finding.score - a.finding.score);
}
