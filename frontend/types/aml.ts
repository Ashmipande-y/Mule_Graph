import type { RiskLevel } from "./risk";

/**
 * The IBM synthetic AML benchmark's own transaction contract -- deliberately
 * NOT the canonical demo's `Transaction` type (whole-rupee `amount`, no
 * currency/payment_format). Amounts are integer minor units (paise); divide
 * by 100 for INR display. See backend/docs/aml-integration-contract.md.
 */
export type AmlPaymentFormat = "ACH" | "Wire";

export interface AmlTransaction {
  id: string;
  sender: string;
  receiver: string;
  amountPaise: number;
  currency: "INR";
  timestamp: string; // minute-precision UTC ISO 8601, seconds fixed at "00"
  paymentFormat: AmlPaymentFormat;
}

export interface AmlGraphNode {
  id: string;
  label: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
}

export interface AmlRulesFinding {
  pattern: string;
  sourceAccount: string;
  collectorAccount: string;
  intermediaryAccounts: string[];
  score: number;
  scoreMethod: string;
  evidence: Record<string, unknown>;
}

export interface AmlGraphSnapshot {
  nodes: AmlGraphNode[];
  edges: AmlTransaction[];
  seedAccount: string | null;
  rulesFindings: AmlRulesFinding[];
}

export interface AmlDatasetSummary {
  label: "IBM synthetic AML benchmark";
  source: string;
  currency: "INR";
  amountUnit: string;
  timestampTimezoneNote: string;
  totalTransactions: number;
  totalAccounts: number;
  periodStart: string | null;
  periodEnd: string | null;
  sessionTransactionCount: number;
  scoringMethod: string;
  modelAvailable: boolean;
  modelVersion: string | null;
}

export interface AmlTransactionPage {
  items: AmlTransaction[];
  nextCursor: number | null;
  totalMatching: number;
}

export interface AmlAssessResultItem {
  transactionId: string;
  score: number;
  isLaundering: boolean;
  threshold: number;
  modelVersion: string;
  features: Record<string, number>;
}

export interface AmlAssessResult {
  status: "completed";
  assessedAt: string;
  modelVersion: string;
  threshold: number;
  notACalibratedProbabilityNote: string;
  results: AmlAssessResultItem[];
}

// --- wire shapes (snake_case, exactly backend/app/schemas.py) --------------

export interface ApiAmlTransaction {
  id: string;
  sender: string;
  receiver: string;
  amount_paise: number;
  currency: "INR";
  timestamp: string;
  payment_format: AmlPaymentFormat;
}

export interface ApiAmlGraphNode {
  id: string;
  label: string;
  risk_score: number | null;
  risk_level: RiskLevel;
}

export interface ApiAmlRulesFinding {
  pattern: string;
  source_account: string;
  collector_account: string;
  intermediary_accounts: string[];
  score: number;
  score_method: string;
  evidence: Record<string, unknown>;
}

export interface ApiAmlGraphResponse {
  nodes: ApiAmlGraphNode[];
  edges: ApiAmlTransaction[];
  seed_account: string | null;
  rules_findings: ApiAmlRulesFinding[];
  dataset_label: "IBM synthetic AML benchmark";
}

export interface ApiAmlDatasetSummaryResponse {
  label: "IBM synthetic AML benchmark";
  source: string;
  currency: "INR";
  amount_unit: string;
  timestamp_timezone_note: string;
  total_transactions: number;
  total_accounts: number;
  period_start: string | null;
  period_end: string | null;
  session_transaction_count: number;
  scoring_method: string;
  model_available: boolean;
  model_version: string | null;
}

export interface ApiAmlTransactionListResponse {
  items: ApiAmlTransaction[];
  next_cursor: number | null;
  total_matching: number;
}

export interface ApiAmlAssessResultItem {
  transaction_id: string;
  score: number;
  is_laundering: boolean;
  threshold: number;
  model_version: string;
  features: Record<string, number>;
}

export interface ApiAmlAssessResponse {
  status: "completed";
  assessed_at: string;
  model_version: string;
  threshold: number;
  not_a_calibrated_probability_note: string;
  results: ApiAmlAssessResultItem[];
}

export interface ApiAmlSessionCommitResponse {
  committed: ApiAmlTransaction[];
  session_transaction_count: number;
}
