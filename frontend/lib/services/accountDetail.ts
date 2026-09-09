import type { GraphNode } from "@/types/graph";
import type { Transaction } from "@/types/transaction";
import type { Finding } from "./rules/detector";
import type { AccountRole } from "@/types/risk";

export interface AccountConnection {
  accountId: string;
  direction: "in" | "out";
  count: number;
  total: number;
}

export interface AccountDetail {
  node: GraphNode;
  sent: Transaction[];
  sentTotal: number;
  received: Transaction[];
  receivedTotal: number;
  connections: AccountConnection[];
  findings: Finding[];
  roles: AccountRole[];
}

/**
 * Assembles everything the inspector panel needs about one account from the
 * currently-revealed transaction set. Returns null if the account has not
 * appeared in any revealed transaction (nothing to show yet).
 */
export function buildAccountDetail(
  accountId: string,
  node: GraphNode | undefined,
  transactions: readonly Transaction[],
  findings: readonly Finding[],
): AccountDetail | null {
  if (!node) return null;

  const sent = transactions.filter((tx) => tx.sender === accountId);
  const received = transactions.filter((tx) => tx.receiver === accountId);
  if (sent.length === 0 && received.length === 0) return null;

  const connectionMap = new Map<string, AccountConnection>();
  for (const tx of sent) {
    const key = `out:${tx.receiver}`;
    const existing = connectionMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += tx.amount;
    } else {
      connectionMap.set(key, { accountId: tx.receiver, direction: "out", count: 1, total: tx.amount });
    }
  }
  for (const tx of received) {
    const key = `in:${tx.sender}`;
    const existing = connectionMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += tx.amount;
    } else {
      connectionMap.set(key, { accountId: tx.sender, direction: "in", count: 1, total: tx.amount });
    }
  }

  const relatedFindings = findings.filter(
    (f) => f.sourceAccount === accountId || f.collectorAccount === accountId || f.intermediaryAccounts.includes(accountId),
  );

  const roles = new Set<AccountRole>();
  for (const f of relatedFindings) {
    if (f.sourceAccount === accountId) roles.add("source");
    if (f.collectorAccount === accountId) roles.add("collector");
    if (f.intermediaryAccounts.includes(accountId)) roles.add("intermediary");
  }

  return {
    node,
    sent,
    sentTotal: sent.reduce((sum, tx) => sum + tx.amount, 0),
    received,
    receivedTotal: received.reduce((sum, tx) => sum + tx.amount, 0),
    connections: [...connectionMap.values()],
    findings: relatedFindings,
    roles: [...roles],
  };
}
