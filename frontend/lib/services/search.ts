import type { GraphNode } from "@/types/graph";
import type { RiskLevel } from "@/types/risk";
import type { Transaction } from "@/types/transaction";

export function accountMatchesQuery(node: Pick<GraphNode, "id" | "label">, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return node.id.toLowerCase().includes(q) || node.label.toLowerCase().includes(q);
}

export function transactionMatchesQuery(tx: Transaction, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    tx.id.toLowerCase().includes(q) ||
    tx.sender.toLowerCase().includes(q) ||
    tx.receiver.toLowerCase().includes(q)
  );
}

export function nodeMatchesRiskFilter(node: Pick<GraphNode, "riskLevel">, filter: readonly RiskLevel[]): boolean {
  return filter.length === 0 || filter.includes(node.riskLevel);
}
