/**
 * Account-level risk, derived from network-level findings but kept as a
 * separate shape. Mirrors ml/rules/account_risk.py exactly, including the
 * still-provisional (per backend/docs/integration-contract.md) threshold
 * values below -- change them only if the backend contract changes them.
 */

import type { AccountRole, AccountRisk } from "@/types/risk";
import type { Finding } from "./detector";

export const RISK_LEVEL_HIGH_THRESHOLD = 0.75;
export const RISK_LEVEL_MEDIUM_THRESHOLD = 0.4;

/**
 * Only meaningful for an account that already has an AccountRisk record
 * (appears in at least one finding). An account with no findings must be
 * reported as UNASSESSED by the caller -- absence of evidence is not
 * evidence of low risk.
 */
export function riskLevelForScore(score: number): Exclude<import("@/types/risk").RiskLevel, "UNASSESSED"> {
  if (score >= RISK_LEVEL_HIGH_THRESHOLD) return "HIGH";
  if (score >= RISK_LEVEL_MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/**
 * Rolls network-level findings up into one risk record per account. An
 * account's maxScore is the highest score among findings it appears in (any
 * role); findingCount is how many distinct findings it appears in. This is
 * a simple aggregation, not a new scoring method.
 */
export function accountRiskFromFindings(findings: readonly Finding[]): Map<string, AccountRisk> {
  const roles = new Map<string, Set<AccountRole>>();
  const scores = new Map<string, number>();
  const counts = new Map<string, number>();
  const txIds = new Map<string, Set<string>>();

  function touch(account: string, role: AccountRole, score: number, ids: readonly string[]): void {
    if (!roles.has(account)) roles.set(account, new Set());
    roles.get(account)!.add(role);
    scores.set(account, Math.max(scores.get(account) ?? 0, score));
    counts.set(account, (counts.get(account) ?? 0) + 1);
    if (!txIds.has(account)) txIds.set(account, new Set());
    for (const id of ids) txIds.get(account)!.add(id);
  }

  for (const finding of findings) {
    if (finding.pattern === "fan_out_rapid_forwarding") {
      touch(finding.sourceAccount, "source", finding.score, finding.fanOutTransactionIds);
      const forwarder = finding.intermediaryAccounts[0];
      if (forwarder) touch(forwarder, "rapid_forwarder", finding.score, [
        ...finding.fanOutTransactionIds,
        ...finding.convergenceTransactionIds,
      ]);
      touch(finding.collectorAccount, "recipient", finding.score, finding.convergenceTransactionIds);
      continue;
    }
    touch(finding.sourceAccount, "source", finding.score, finding.fanOutTransactionIds);
    // intermediaryAccounts/fanOutTransactionIds/convergenceTransactionIds are
    // built as parallel arrays over the same "converging" order, so each
    // intermediary's own evidence is the same-index pair, not every
    // transaction in the finding.
    finding.intermediaryAccounts.forEach((intermediary, idx) => {
      touch(intermediary, "intermediary", finding.score, [
        finding.fanOutTransactionIds[idx],
        finding.convergenceTransactionIds[idx],
      ]);
    });
    touch(finding.collectorAccount, "collector", finding.score, finding.convergenceTransactionIds);
  }

  const result = new Map<string, AccountRisk>();
  for (const [account, roleSet] of roles) {
    const maxScore = scores.get(account) ?? 0;
    result.set(account, {
      accountId: account,
      roles: [...roleSet].sort(),
      maxScore,
      riskLevel: riskLevelForScore(maxScore),
      findingCount: counts.get(account) ?? 0,
      evidenceTransactionIds: [...(txIds.get(account) ?? [])].sort(),
    });
  }
  return result;
}
