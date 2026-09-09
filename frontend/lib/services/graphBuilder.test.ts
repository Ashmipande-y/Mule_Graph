import { describe, expect, it } from "vitest";
import { CANONICAL_TRANSACTIONS } from "@/lib/services/dataSource";
import { buildGraphSnapshot, graphSnapshotToTransactions } from "./graphBuilder";
import { deriveAlerts } from "./alerts";
import { computeNetworkMetrics } from "./metrics";
import { deriveCases } from "./cases";

describe("buildGraphSnapshot", () => {
  it("produces 6 nodes / 7 edges for the full canonical fixture, sorted per the API contract", () => {
    const { graph } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(7);
    expect(graph.nodes.map((n) => n.id)).toEqual(
      [...graph.nodes.map((n) => n.id)].sort(),
    );
    expect(graph.edges.map((e) => e.id)).toEqual(["TX_001", "TX_002", "TX_003", "TX_004", "TX_005", "TX_006", "TX_007"]);
  });

  it("labels canonical accounts exactly as docs/api-contract.md specifies", () => {
    const { graph } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("ACC_VICTIM")?.label).toBe("Victim");
    expect(byId.get("ACC_X")?.label).toBe("Collector X");
  });

  it("never marks an unassessed account as a safe/zero score", () => {
    const { graph } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    const victim = graph.nodes.find((n) => n.id === "ACC_VICTIM")!;
    expect(victim.riskLevel).toBe("UNASSESSED");
    expect(victim.riskScore).toBeNull();
  });

  it("keeps every score/level null/UNASSESSED with zero transactions", () => {
    const { graph, findings } = buildGraphSnapshot([]);
    expect(graph).toEqual({ nodes: [], edges: [] });
    expect(findings).toHaveLength(0);
  });

  it("builds a progressively smaller graph for a prefix of the transaction list (replay)", () => {
    const prefix = CANONICAL_TRANSACTIONS.slice(0, 4); // fan-out only, no convergence yet
    const { graph, findings } = buildGraphSnapshot(prefix);
    expect(graph.nodes.map((n) => n.id)).toEqual(["ACC_A", "ACC_B", "ACC_C", "ACC_D", "ACC_VICTIM"]);
    expect(findings).toHaveLength(0);
    expect(graph.nodes.every((n) => n.riskLevel === "UNASSESSED")).toBe(true);
  });
});

describe("deriveAlerts", () => {
  it("produces no alert before the pattern's evidence is fully revealed", () => {
    const prefix = CANONICAL_TRANSACTIONS.slice(0, 6);
    const { findings } = buildGraphSnapshot(prefix);
    const alerts = deriveAlerts(findings, prefix);
    expect(alerts).toHaveLength(0);
  });

  it("produces exactly one alert once the full network is revealed, attributed to the completing transaction", () => {
    const { findings } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    const alerts = deriveAlerts(findings, CANONICAL_TRANSACTIONS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].revealedByTransactionId).toBe("TX_007");
    expect(alerts[0].revealedAtStep).toBe(7);
    expect(alerts[0].level).toBe("HIGH");
  });
});

describe("deriveCases", () => {
  it("derives exactly one case from the one real finding -- never fabricates or duplicates it", () => {
    const { findings } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    const cases = deriveCases(findings);
    expect(cases).toHaveLength(1);
    expect(cases[0].accountIds).toEqual(["ACC_A", "ACC_B", "ACC_C", "ACC_D", "ACC_X"]);
  });

  it("derives zero cases when no finding exists yet", () => {
    const { findings } = buildGraphSnapshot(CANONICAL_TRANSACTIONS.slice(0, 4));
    expect(deriveCases(findings)).toHaveLength(0);
  });
});

describe("graphSnapshotToTransactions", () => {
  it("round-trips a graph's edges back into the exact transaction shape that produced it", () => {
    const { graph } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    const recovered = graphSnapshotToTransactions(graph);
    const bySortedId = (list: readonly { id: string }[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(bySortedId(recovered)).toEqual(bySortedId(CANONICAL_TRANSACTIONS));
  });

  it("produces an empty list for an empty graph", () => {
    expect(graphSnapshotToTransactions({ nodes: [], edges: [] })).toEqual([]);
  });
});

describe("computeNetworkMetrics", () => {
  it("distinguishes total transaction volume from unique funds entering the network", () => {
    const { graph, findings } = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
    const alerts = deriveAlerts(findings, CANONICAL_TRANSACTIONS);
    const metrics = computeNetworkMetrics(graph, alerts);

    // 50000 + 15000 + 14000 + 16000 + 13000 + 12000 + 14000
    expect(metrics.totalTransactionVolume).toBe(134000);
    // Only ACC_VICTIM -> ACC_A never received a revealed inbound transfer itself.
    expect(metrics.uniqueFundsEntering).toBe(50000);
    expect(metrics.activeAlerts).toBe(1);
    expect(metrics.highRiskAccounts).toBe(5);
    expect(metrics.unassessedAccounts).toBe(1);
  });
});
