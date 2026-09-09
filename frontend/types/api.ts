import type { RiskLevel } from "./risk";

/**
 * Wire shapes for the live backend, exactly as docs/api-contract.md
 * specifies (snake_case). Kept separate from the internal camelCase types
 * so `lib/services/api-client.ts` has one explicit mapping boundary instead
 * of the rest of the app depending on backend field-naming.
 */
export interface ApiNode {
  id: string;
  label: string;
  risk_score: number | null;
  risk_level: RiskLevel;
}

export interface ApiEdge {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: string;
}

export interface ApiGraphResponse {
  nodes: ApiNode[];
  edges: ApiEdge[];
}

/**
 * `POST /api/xgb-score`'s own native schema (backend/app/schemas.py) --
 * card-present transaction fields (Time/Amount/V1..V28), NOT a MuleGraph
 * account/transaction. Deliberately has no sender/receiver/account_id.
 */
export interface ApiXgbScoreRequest {
  time: number;
  amount: number;
  v: number[];
}

export interface ApiXgbScoreResponse {
  score: number;
  is_fraud: boolean;
  threshold: number;
  model_mode: "xgboost_card_fraud_baseline";
}

/**
 * The assessment endpoint this frontend calls to score a batch of
 * transactions in network context. NOT YET IMPLEMENTED by the backend as of
 * this writing (see frontend/docs/assessment-endpoint-contract.md for the
 * full contract this shape is drawn from, and
 * lib/services/assessmentClient.ts for how a missing endpoint is reported
 * honestly rather than faked). Field names mirror
 * ml/rules/account_risk.py::AccountRisk.to_dict() and
 * ml/rules/detector.py::Finding.to_dict() so a real implementation can
 * reuse those existing serializers directly instead of inventing a new
 * shape.
 */
export interface ApiAssessmentTransaction {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: string;
}

export interface ApiAssessmentRequest {
  transactions: ApiAssessmentTransaction[];
}

export interface ApiAssessmentAccount {
  account_id: string;
  risk_score: number | null;
  risk_level: RiskLevel;
  roles?: string[];
  finding_count?: number;
  evidence_transaction_ids?: string[];
}

export interface ApiAssessmentPattern {
  pattern: string;
  source_account?: string;
  collector_account?: string;
  intermediary_accounts?: string[];
  score?: number;
  score_method?: string;
  evidence?: Record<string, unknown>;
}

export interface ApiAssessmentResponse {
  status: "completed" | "partial" | "failed";
  assessed_at: string;
  model_mode?: string | null;
  accounts?: ApiAssessmentAccount[];
  accounts_requiring_review?: string[];
  patterns?: ApiAssessmentPattern[];
}
