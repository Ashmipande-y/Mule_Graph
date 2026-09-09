import type { Transaction } from "@/types/transaction";

/**
 * Internal working form of a Transaction for the detector: the timestamp is
 * pre-parsed to epoch milliseconds so window comparisons are cheap, while
 * the original ISO string is preserved for display and evidence output.
 * Mirrors ml/rules/transactions.py::Transaction.
 */
export interface RuleTransaction {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: string;
  timestampMs: number;
}

export function toRuleTransactions(transactions: readonly Transaction[]): RuleTransaction[] {
  return transactions.map((tx) => ({
    ...tx,
    timestampMs: Date.parse(tx.timestamp),
  }));
}

/**
 * Matches Python's dataclass(order=True) field order on Transaction
 * (timestamp, id, sender, receiver, amount): ties on timestamp break on id.
 */
export function compareTransactions(a: RuleTransaction, b: RuleTransaction): number {
  if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function sortTransactions(transactions: readonly RuleTransaction[]): RuleTransaction[] {
  return [...transactions].sort(compareTransactions);
}

/**
 * Collapses duplicate transaction ids, keeping the first occurrence -- an
 * ingestion artifact must never inflate detection evidence. Mirrors
 * ml/rules/transactions.py::deduplicate_by_id.
 */
export function deduplicateById(transactions: readonly RuleTransaction[]): RuleTransaction[] {
  const byId = new Map<string, RuleTransaction>();
  for (const tx of transactions) {
    if (!byId.has(tx.id)) byId.set(tx.id, tx);
  }
  return sortTransactions([...byId.values()]);
}

/** Formats an epoch-ms instant as the fixture's UTC second-precision form. */
export function formatUtcSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
