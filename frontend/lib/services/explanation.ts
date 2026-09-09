import type { AccountDetail } from "./accountDetail";
import { labelFor } from "./labels";

export interface AuthoredExplanation {
  headline: string;
  paragraphs: string[];
}

/**
 * A template-generated, plain-language summary of an account's evidence.
 * This is explicitly NOT an AI-generated narrative -- every layout that
 * renders this must keep the "authored demo explanation" label so nobody
 * mistakes it for a connected LLM/explanation service (see
 * backend/README.md Stage 5's explanation hook, which is not implemented).
 */
export function buildAuthoredExplanation(detail: AccountDetail): AuthoredExplanation {
  if (detail.findings.length === 0) {
    return {
      headline: "No evidence-based pattern involves this account yet.",
      paragraphs: [
        `${detail.node.label} (${detail.node.id}) has not appeared in any detected fan-out/convergence pattern in the transactions revealed so far.`,
        "This does not mean the account is cleared or safe -- it means no automated evidence has been found for it yet in this replay. Absence of evidence is not evidence of absence.",
      ],
    };
  }

  const finding = detail.findings[0];
  const roleNames = detail.roles.map((role) =>
    role === "source" ? "the funding source" : role === "collector" ? "the collecting account" : "an intermediary",
  );

  return {
    headline: "Evidence-based pattern summary",
    paragraphs: [
      `${detail.node.label} (${detail.node.id}) appears in a detected fan-out/convergence pattern as ${roleNames.join(" and ")}.`,
      `${labelFor(finding.sourceAccount)} sent funds to ${finding.intermediaryAccounts.length} separate accounts within ` +
        `${finding.evidence.fanOutWindowSeconds}s of each other. About ${Math.round(finding.evidence.amountConservation * 100)}% ` +
        `of that value was then forwarded on to ${labelFor(finding.collectorAccount)}, each within ` +
        `${finding.evidence.convergenceWindowSeconds}s of the intermediary receiving it.`,
      `The evidence score of ${finding.score.toFixed(4)} reflects how closely this matches the pattern (intermediary coverage, ` +
        "amount conservation, and time compactness). It is a hand-defined heuristic ranking, not a calibrated probability of " +
        "fraud, and it is not produced by GraphSAGE or XGBoost -- this demo only ever runs the rules-based detector.",
    ],
  };
}
