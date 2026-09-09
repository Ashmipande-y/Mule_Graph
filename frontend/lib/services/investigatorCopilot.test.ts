import { CANONICAL_TRANSACTIONS } from "./dataSource";
import { buildGraphSnapshot } from "./graphBuilder";
const fixture = buildGraphSnapshot(CANONICAL_TRANSACTIONS);
import { describe, expect, it } from "vitest";
import { buildInvestigatorScenario } from "./investigatorScenario";
import { answerSuggestedPrompt, SUGGESTED_PROMPTS } from "./investigatorCopilot";

describe("answerSuggestedPrompt", () => {
  const scenario = buildInvestigatorScenario(fixture.graph, CANONICAL_TRANSACTIONS, fixture.findings);

  it("answers every suggested prompt using only real, already-computed evidence", () => {
    for (const prompt of SUGGESTED_PROMPTS) {
      const answer = answerSuggestedPrompt(prompt.id, scenario);
      expect(answer).not.toBeNull();
      expect(answer!.text.length).toBeGreaterThan(0);
    }
  });

  it("the policy comparison cites the real strict/permissive exposure numbers", () => {
    const answer = answerSuggestedPrompt("policy-compare", scenario)!;
    expect(answer.text).toMatch(/₹84,000/);
    expect(answer.text).toMatch(/₹1,34,000/);
  });

  it("identifies the real dropped transaction under the strict policy", () => {
    const answer = answerSuggestedPrompt("strict-drops", scenario)!;
    expect(answer.text).toContain("TX_001");
    expect(answer.citations).toContain("transaction: TX_001");
  });

  it("returns null for an unrecognized prompt id (no fabricated fallback answer)", () => {
    expect(answerSuggestedPrompt("not-a-real-prompt", scenario)).toBeNull();
  });
});
