import { CANONICAL_TRANSACTIONS } from "./dataSource";
import { buildGraphSnapshot } from "./graphBuilder";
const fixture = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
import { describe, expect, it } from "vitest";
import { buildInvestigatorScenario, formatExposureDelta } from "./investigatorScenario";

describe("buildInvestigatorScenario", () => {
  it("uses active findings and transactions, including an empty replay or renamed live network", () => {
    expect(buildInvestigatorScenario({ nodes: [], edges: [] }, [], []).finding).toBeNull();
    const transactions = CANONICAL_TRANSACTIONS.map((t) => ({ ...t, sender: `LIVE_${t.sender}`, receiver: `LIVE_${t.receiver}` }));
    const live = buildGraphSnapshot(transactions);
    const scenario = buildInvestigatorScenario(live.graph, transactions, live.findings);
    expect(scenario.flaggedAccountId).toBe("LIVE_ACC_X");
    expect(scenario.allTransactions).toEqual(transactions);
    expect(scenario.victimIds).toEqual(["LIVE_ACC_VICTIM"]);
  });
  it("derives the real canonical finding, never a fabricated one", () => {
    const scenario = buildInvestigatorScenario(fixture.graph, CANONICAL_TRANSACTIONS, fixture.findings);
    expect(scenario.finding).not.toBeNull();
    expect(scenario.finding?.score).toBeCloseTo(0.9317, 4);
    expect(scenario.flaggedAccountId).toBe("ACC_X");
    expect(scenario.sourceAccountId).toBe("ACC_A");
    expect(scenario.intermediaryIds).toEqual(["ACC_B", "ACC_C", "ACC_D"]);
    expect(scenario.victimIds).toEqual(["ACC_VICTIM"]);
    expect(scenario.connectedAccountCount).toBe(5); // A, B, C, D, X -- not the victim, per the finding's own account set
  });

  it("computes a real, non-fabricated exposure delta between evidence policies", () => {
    const scenario = buildInvestigatorScenario(fixture.graph, CANONICAL_TRANSACTIONS, fixture.findings);
    // Strict = only the 6 fan-out/convergence transactions ml/rules counted.
    expect(scenario.strict.exposure).toBe(15000 + 14000 + 16000 + 13000 + 12000 + 14000);
    // Permissive additionally includes the victim's initial deposit (TX_001).
    expect(scenario.permissive.exposure).toBe(scenario.strict.exposure + 50000);
    expect(scenario.permissive.transactionIds).toContain("TX_001");
    expect(scenario.strict.transactionIds).not.toContain("TX_001");
  });

  it("formats the exposure delta from real numbers", () => {
    const scenario = buildInvestigatorScenario(fixture.graph, CANONICAL_TRANSACTIONS, fixture.findings);
    const text = formatExposureDelta(scenario.strict, scenario.permissive);
    expect(text).toMatch(/₹50,000/);
  });
});
