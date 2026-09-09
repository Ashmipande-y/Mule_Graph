/**
 * The standalone ml/xgb_baseline card-fraud model, reached via the
 * backend's `POST /api/xgb-score`. This is deliberately unrelated to
 * MuleGraph's account/transaction graph -- see
 * backend/docs/integration-contract.md: "does not feed /api/graph or
 * account risk in any way." Never mix this score with a RiskLevel/
 * AccountRisk value or present it as mule-network evidence.
 */
export interface XgbScoreSample {
  description: string;
  label: "fraud" | "legit";
  knownClass: 0 | 1;
  time: number;
  amount: number;
  v: number[];
  /** The model's own recorded prediction for this row, from the backend's fixture (not recomputed). */
  modelScore: number;
  modelIsFraud: boolean;
}

export interface XgbScoreResult {
  score: number;
  isFraud: boolean;
  threshold: number;
  modelMode: "xgboost_card_fraud_baseline";
}
