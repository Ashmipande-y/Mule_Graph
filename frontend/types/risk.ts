/**
 * The four risk levels the backend contract actually defines and produces
 * (docs/api-contract.md, backend/docs/integration-contract.md). The rules
 * detector we mirror on the client never emits anything outside this set.
 */
export type RiskLevel = "UNASSESSED" | "LOW" | "MEDIUM" | "HIGH";

/**
 * A superset used only by the presentation layer (badge/color styling) so
 * the visual system has room for values a future backend/model tier could
 * introduce (e.g. an aggregate "CRITICAL" case severity or a "NORMAL"
 * cleared state). Nothing in the data layer ever produces "NORMAL" or
 * "CRITICAL" today -- do not fabricate them to exercise every color.
 */
export type RiskVisualLevel = RiskLevel | "NORMAL" | "CRITICAL";

export type AccountRole = "source" | "intermediary" | "collector" | "rapid_forwarder" | "recipient";

/**
 * Account-level exposure rolled up from network findings. Mirrors
 * ml/rules/account_risk.py::AccountRisk exactly. `maxScore` is a hand-defined
 * evidence-strength heuristic in [0, 1] -- NOT a calibrated fraud
 * probability, and never presented as one.
 */
export interface AccountRisk {
  accountId: string;
  roles: AccountRole[];
  maxScore: number;
  riskLevel: Exclude<RiskLevel, "UNASSESSED">;
  findingCount: number;
  evidenceTransactionIds: string[];
}
