import type { GraphEdge, GraphNode, GraphSnapshot } from "@/types/graph";
import type { AssessmentResult } from "@/types/assessment";
import { labelFor } from "./labels";

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds the graph to display for a completed assessment: nodes/edges come
 * from exactly the transactions that were submitted (`result.transactions`),
 * and risk comes verbatim from the backend's response -- never recomputed
 * client-side. An account the response doesn't cover is UNASSESSED, never a
 * fabricated safe score (same rule as lib/services/graphBuilder.ts).
 */
export function buildAssessedGraphSnapshot(result: AssessmentResult): GraphSnapshot {
  const riskByAccount = new Map(result.accounts.map((a) => [a.accountId, a]));

  const accountIds = new Set<string>();
  for (const tx of result.transactions) {
    accountIds.add(tx.sender);
    accountIds.add(tx.receiver);
  }

  const nodes: GraphNode[] = [...accountIds].sort().map((id) => {
    const risk = riskByAccount.get(id);
    return risk
      ? { id, label: labelFor(id), riskScore: risk.riskScore, riskLevel: risk.riskLevel }
      : { id, label: labelFor(id), riskScore: null, riskLevel: "UNASSESSED" as const };
  });

  const edges: GraphEdge[] = result.transactions
    .map((tx) => ({ id: tx.id, source: tx.sender, target: tx.receiver, amount: tx.amount, timestamp: tx.timestamp }))
    .sort(compareEdges);

  return { nodes, edges };
}
