/**
 * The "AI Copilot" panel never calls a real language model -- there isn't
 * one in this stack. Each suggested prompt below maps to a fixed template
 * filled in with real, already-computed evidence (the same finding/exposure
 * numbers the rest of the workspace shows), not a generated narrative. A
 * free-text question the analyst types has no template to match, so it gets
 * an honest "not connected" response instead of an invented answer -- see
 * components/investigator/CopilotPanel.tsx.
 */

import { formatINR, formatFullUtc } from "@/lib/format";
import { labelFor } from "./labels";
import { formatExposureDelta, type InvestigatorScenario } from "./investigatorScenario";

export interface SuggestedPrompt {
  id: string;
  question: string;
}

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { id: "why-flagged", question: "Why was this account flagged?" },
  { id: "policy-compare", question: "Compare permissive vs. strict exposure." },
  { id: "strict-drops", question: "Which evidence disappears under the strict policy?" },
  { id: "contributing-transfers", question: "Show transfers contributing to the linked exposure." },
];

export interface CopilotAnswer {
  text: string;
  /** Real fields the answer was built from, shown so the analyst can verify it themselves rather than trust prose alone. */
  citations: string[];
}

export function answerSuggestedPrompt(promptId: string, scenario: InvestigatorScenario): CopilotAnswer | null {
  const { finding, strict, permissive, victimIds, flaggedAccountLabel, flaggedAccountId } = scenario;
  if (!finding || !flaggedAccountId) return null;

  switch (promptId) {
    case "why-flagged":
      return {
        text:
          `${flaggedAccountLabel} (${flaggedAccountId}) received convergent transfers from ${finding.intermediaryAccounts.length} ` +
          `intermediar${finding.intermediaryAccounts.length === 1 ? "y" : "ies"} (${finding.intermediaryAccounts.join(", ")}), which had ` +
          `each just received funds from ${labelFor(finding.sourceAccount)} (${finding.sourceAccount}) in a fan-out beginning ` +
          `${formatFullUtc(finding.windowStart)}. The full window closed by ${formatFullUtc(finding.windowEnd)} ` +
          `(${Math.round(finding.evidence.windowSpanSeconds)}s total). Evidence-strength score: ${finding.score.toFixed(4)} -- ` +
          `a heuristic ranking, not a calibrated fraud probability.`,
        citations: [`ml/rules finding: ${finding.pattern}`, `score_method: ${finding.scoreMethod}`],
      };
    case "policy-compare":
      return {
        text:
          `Strict policy (only transactions ml/rules counted as evidence): ${formatINR(strict.exposure)} across ` +
          `${strict.transactionIds.length} transfers. Permissive policy (every transfer touching an account in this ` +
          `network): ${formatINR(permissive.exposure)} across ${permissive.transactionIds.length} transfers. ` +
          formatExposureDelta(strict, permissive),
        citations: [`strict transaction ids: ${strict.transactionIds.join(", ")}`, `permissive transaction ids: ${permissive.transactionIds.join(", ")}`],
      };
    case "strict-drops": {
      const dropped = permissive.transactionIds.filter((id) => !strict.transactionIds.includes(id));
      if (dropped.length === 0) {
        return { text: "No evidence is dropped -- the strict and permissive policies cover the same transactions for this case.", citations: [] };
      }
      return {
        text:
          `${dropped.length} transfer${dropped.length === 1 ? "" : "s"} ${dropped.length === 1 ? "is" : "are"} counted under the permissive ` +
          `policy but not the strict one: ${dropped.join(", ")}. ${victimIds.length > 0 ? `This is the deposit from ${victimIds.map(labelFor).join(", ")} into ${labelFor(finding.sourceAccount)} that funded the rest of the chain -- real money movement, but not itself part of the fan-out/convergence pattern the detector matched.` : ""}`,
        citations: dropped.map((id) => `transaction: ${id}`),
      };
    }
    case "contributing-transfers":
      return {
        text: `${strict.transactionIds.length} transfers make up the ${formatINR(strict.exposure)} linked exposure under the strict policy: ${strict.transactionIds.join(", ")}.`,
        citations: strict.transactionIds.map((id) => `transaction: ${id}`),
      };
    default:
      return null;
  }
}
