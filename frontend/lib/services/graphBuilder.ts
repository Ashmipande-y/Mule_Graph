/**
 * Transaction -> graph conversion, mirroring backend/app/services/graph.py
 * plus backend/app/adapters/ml_rules.py's assess_accounts combined: given
 * any prefix of the canonical transaction list (for progressive replay) or
 * the full set, produces the same node/edge/risk shape the backend would
 * for that same observable transaction set.
 *
 * Calling this with `evaluateAt`'s asOf = the latest timestamp in the given
 * slice is the full-fixture case of evaluateAt, not a bypass of it: nothing
 * in a prefix is after its own last transaction that could leak in. This is
 * exactly how backend/app/adapters/ml_rules.py::assess_accounts works today.
 */

import type { GraphEdge, GraphNode, GraphSnapshot } from "@/types/graph";
import type { Transaction } from "@/types/transaction";
import type { AccountRisk } from "@/types/risk";
import { accountRiskFromFindings } from "./rules/accountRisk";
import type { Finding } from "./rules/detector";
import { evaluateAt } from "./rules/replay";
import { toRuleTransactions } from "./rules/transaction";
import { labelFor } from "./labels";

export interface GraphBuildResult {
  graph: GraphSnapshot;
  findings: Finding[];
  accountRisk: Map<string, AccountRisk>;
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildGraphSnapshot(transactions: readonly Transaction[]): GraphBuildResult {
  const ruleTransactions = toRuleTransactions(transactions);
  const asOfMs = ruleTransactions.length
    ? Math.max(...ruleTransactions.map((t) => t.timestampMs))
    : 0;
  const findings = ruleTransactions.length ? evaluateAt(ruleTransactions, asOfMs) : [];
  const accountRisk = accountRiskFromFindings(findings);

  const accountIds = new Set<string>();
  for (const tx of transactions) {
    accountIds.add(tx.sender);
    accountIds.add(tx.receiver);
  }

  const nodes: GraphNode[] = [...accountIds].sort().map((id) => {
    const risk = accountRisk.get(id);
    // Absent from every finding is "not assessed", not "proven safe" --
    // never substitute a zero/safe score here.
    return risk
      ? { id, label: labelFor(id), riskScore: risk.maxScore, riskLevel: risk.riskLevel }
      : { id, label: labelFor(id), riskScore: null, riskLevel: "UNASSESSED" as const };
  });

  const edges: GraphEdge[] = transactions
    .map((tx) => ({
      id: tx.id,
      source: tx.sender,
      target: tx.receiver,
      amount: tx.amount,
      timestamp: tx.timestamp,
    }))
    .sort(compareEdges);

  return { graph: { nodes, edges }, findings, accountRisk };
}
