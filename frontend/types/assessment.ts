import type { RiskLevel } from "./risk";
import type { Transaction } from "./transaction";

/**
 * A transaction an analyst has entered but not yet submitted for
 * assessment. Distinct from `Transaction` only in intent (pending vs.
 * already part of an assessed/observed network) -- the wire shape is
 * identical so a pending transaction can be submitted, or merged into the
 * graph, without any reshaping.
 */
export type PendingTransaction = Transaction;

export type AssessmentNetworkMode = "include-current" | "new-only";

export type AssessmentRunStatus = "idle" | "loading" | "success" | "error";

export interface AssessmentAccountResult {
  accountId: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
  roles: string[];
  findingCount: number;
  evidenceTransactionIds: string[];
  requiresReview: boolean;
}

export interface AssessmentPatternResult {
  pattern: string;
  sourceAccount?: string;
  collectorAccount?: string;
  intermediaryAccounts: string[];
  score?: number;
  scoreMethod?: string;
  evidence: Record<string, unknown> | null;
}

/**
 * A completed (or failed) response from the assessment service, mapped to
 * camelCase. `transactions` records exactly what was submitted, so the
 * graph/table/inspector can be rebuilt from this result alone later (e.g.
 * after the analyst edits inputs and the result becomes stale).
 */
export interface AssessmentResult {
  status: "completed" | "partial" | "failed";
  assessedAt: string;
  scoringMethod: string | null;
  accounts: AssessmentAccountResult[];
  accountsRequiringReview: string[];
  patterns: AssessmentPatternResult[];
  findings?: import("./finding").Finding[];
  transactions: Transaction[];
}
