import type { CaseSummary } from "@/types/case";
import type { Transaction } from "@/types/transaction";
import type { ActivityLogEntry } from "@/types/investigation";

export interface CaseTimelineEvent {
  id: string;
  type: "transaction" | "activity";
  timestamp: string;
  title: string;
  subtitle?: string;
}

/**
 * A single chronological timeline mixing revealed transactions and analyst
 * activity (investigate/flag/freeze/note) for every account in one case.
 */
export function buildCaseTimeline(
  caseSummary: CaseSummary,
  transactions: readonly Transaction[],
  activityLog: readonly ActivityLogEntry[],
): CaseTimelineEvent[] {
  const accountSet = new Set(caseSummary.accountIds);

  const txEvents: CaseTimelineEvent[] = transactions
    .filter((tx) => accountSet.has(tx.sender) || accountSet.has(tx.receiver))
    .map((tx) => ({
      id: `tx-${tx.id}`,
      type: "transaction" as const,
      timestamp: tx.timestamp,
      title: `${tx.id} · ${tx.sender} → ${tx.receiver}`,
      subtitle: `₹${tx.amount.toLocaleString("en-IN")}`,
    }));

  const activityEvents: CaseTimelineEvent[] = activityLog
    .filter((entry) => accountSet.has(entry.accountId))
    .map((entry) => ({
      id: `log-${entry.id}`,
      type: "activity" as const,
      timestamp: entry.createdAt,
      title: `${entry.accountId} — ${entry.message}`,
    }));

  return [...txEvents, ...activityEvents].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}
