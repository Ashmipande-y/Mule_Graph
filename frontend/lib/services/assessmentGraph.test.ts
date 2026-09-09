import { describe, expect, it } from "vitest";
import { buildAssessedGraphSnapshot } from "./assessmentGraph";
import type { AssessmentResult } from "@/types/assessment";

function makeResult(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    status: "completed",
    assessedAt: "2026-01-01T10:05:00Z",
    scoringMethod: "rules",
    accounts: [],
    accountsRequiringReview: [],
    patterns: [],
    transactions: [],
    ...overrides,
  };
}

describe("buildAssessedGraphSnapshot", () => {
  it("adds a brand-new account (never seen in any prior network) as a graph node", () => {
    const result = makeResult({
      transactions: [{ id: "TX_100", sender: "ACC_NEW_1", receiver: "ACC_NEW_2", amount: 5000, timestamp: "2026-01-01T11:00:00Z" }],
    });
    const { nodes, edges } = buildAssessedGraphSnapshot(result);
    expect(nodes.map((n) => n.id).sort()).toEqual(["ACC_NEW_1", "ACC_NEW_2"]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ id: "TX_100", source: "ACC_NEW_1", target: "ACC_NEW_2", amount: 5000 });
  });

  it("preserves one edge per submitted transaction, even repeated account pairs", () => {
    const result = makeResult({
      transactions: [
        { id: "TX_1", sender: "A", receiver: "B", amount: 100, timestamp: "2026-01-01T10:00:00Z" },
        { id: "TX_2", sender: "A", receiver: "B", amount: 200, timestamp: "2026-01-01T10:01:00Z" },
      ],
    });
    const { edges } = buildAssessedGraphSnapshot(result);
    expect(edges).toHaveLength(2);
  });

  it("applies real risk scores from the response, never recomputing them", () => {
    const result = makeResult({
      transactions: [{ id: "TX_1", sender: "ACC_A", receiver: "ACC_X", amount: 1000, timestamp: "2026-01-01T10:00:00Z" }],
      accounts: [
        {
          accountId: "ACC_A",
          riskScore: 0.87,
          riskLevel: "HIGH",
          roles: ["source"],
          findingCount: 1,
          evidenceTransactionIds: ["TX_1"],
          requiresReview: true,
        },
      ],
    });
    const { nodes } = buildAssessedGraphSnapshot(result);
    const accA = nodes.find((n) => n.id === "ACC_A");
    expect(accA?.riskScore).toBe(0.87);
    expect(accA?.riskLevel).toBe("HIGH");
  });

  it("marks an account absent from the response as UNASSESSED with a null score, never a fabricated safe value", () => {
    const result = makeResult({
      transactions: [{ id: "TX_1", sender: "ACC_VICTIM", receiver: "ACC_A", amount: 50000, timestamp: "2026-01-01T10:00:00Z" }],
      accounts: [], // the response covered nothing for this account
    });
    const { nodes } = buildAssessedGraphSnapshot(result);
    const victim = nodes.find((n) => n.id === "ACC_VICTIM");
    expect(victim?.riskScore).toBeNull();
    expect(victim?.riskLevel).toBe("UNASSESSED");
  });

  it("produces an empty graph for an empty transaction set", () => {
    expect(buildAssessedGraphSnapshot(makeResult())).toEqual({ nodes: [], edges: [] });
  });
});
