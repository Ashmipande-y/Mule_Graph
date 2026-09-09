import type { CaseSummary } from "@/types/case";
import type { Finding } from "./rules/detector";
import { labelFor } from "./labels";

/**
 * Derives cases 1:1 from detected findings -- never fabricated, never a
 * duplicate presentation of the same network. With the canonical dataset
 * this yields exactly one case once the fan-out/convergence evidence is
 * fully revealed, and none before that.
 */
export function deriveCases(findings: readonly Finding[]): CaseSummary[] {
  return findings.map((finding) => ({
    id: `CASE_${finding.sourceAccount}_${finding.collectorAccount}`,
    title: `${labelFor(finding.sourceAccount)} -> ${finding.intermediaryAccounts.length}-way fan-out -> ${labelFor(finding.collectorAccount)}`,
    pattern: finding.pattern,
    accountIds: [finding.sourceAccount, ...finding.intermediaryAccounts, finding.collectorAccount],
    primaryFinding: finding,
  }));
}
