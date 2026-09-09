import type { Alert } from "@/types/alert";
import type { GraphSnapshot } from "@/types/graph";

export interface NetworkMetrics {
  accountsObserved: number;
  transactionsObserved: number;
  /** Sum of every transfer amount -- double-counts money as it hops account to account. */
  totalTransactionVolume: number;
  /**
   * Sum of transfers whose source has not itself received a revealed
   * inbound transfer -- the actual outside principal that entered the
   * network, as opposed to the same money changing hands repeatedly.
   */
  uniqueFundsEntering: number;
  activeAlerts: number;
  highRiskAccounts: number;
  mediumRiskAccounts: number;
  unassessedAccounts: number;
}

export function computeNetworkMetrics(graph: GraphSnapshot, alerts: readonly Alert[]): NetworkMetrics {
  const totalTransactionVolume = graph.edges.reduce((sum, edge) => sum + edge.amount, 0);

  const hasInflow = new Set<string>();
  for (const edge of graph.edges) hasInflow.add(edge.target);
  const uniqueFundsEntering = graph.edges
    .filter((edge) => !hasInflow.has(edge.source))
    .reduce((sum, edge) => sum + edge.amount, 0);

  return {
    accountsObserved: graph.nodes.length,
    transactionsObserved: graph.edges.length,
    totalTransactionVolume,
    uniqueFundsEntering,
    activeAlerts: alerts.length,
    highRiskAccounts: graph.nodes.filter((n) => n.riskLevel === "HIGH").length,
    mediumRiskAccounts: graph.nodes.filter((n) => n.riskLevel === "MEDIUM").length,
    unassessedAccounts: graph.nodes.filter((n) => n.riskLevel === "UNASSESSED").length,
  };
}
