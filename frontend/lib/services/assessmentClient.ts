import type {
  ApiAssessmentAccount,
  ApiAssessmentPattern,
  ApiAssessmentRequest,
  ApiAssessmentResponse,
} from "@/types/api";
import type { AssessmentAccountResult, AssessmentPatternResult, AssessmentResult } from "@/types/assessment";
import type { Transaction } from "@/types/transaction";

/**
 * The exact endpoint this frontend expects for batch risk assessment. Not
 * implemented by the backend as of this writing -- see
 * frontend/docs/assessment-endpoint-contract.md for the full request/
 * response contract and rationale. This constant is the single source of
 * truth for that path; update the doc alongside it if it ever changes.
 */
export const ASSESSMENT_ENDPOINT_PATH = "/api/assess";

export type AssessmentErrorKind = "not-connected" | "validation" | "server" | "network";

export class AssessmentApiError extends Error {
  readonly kind: AssessmentErrorKind;
  constructor(message: string, kind: AssessmentErrorKind) {
    super(message);
    this.kind = kind;
  }
}

function toApiRequest(transactions: readonly Transaction[]): ApiAssessmentRequest {
  return {
    transactions: transactions.map((tx) => ({
      id: tx.id,
      sender: tx.sender,
      receiver: tx.receiver,
      amount: tx.amount,
      timestamp: tx.timestamp,
    })),
  };
}

function mapAccount(api: ApiAssessmentAccount): AssessmentAccountResult {
  return {
    accountId: api.account_id,
    riskScore: api.risk_score,
    riskLevel: api.risk_level,
    roles: api.roles ?? [],
    findingCount: api.finding_count ?? 0,
    evidenceTransactionIds: api.evidence_transaction_ids ?? [],
    // Derived from the risk level the backend actually returned -- not a
    // fabricated field. Overridden below if the backend supplies its own
    // accounts_requiring_review list explicitly.
    requiresReview: api.risk_level === "HIGH" || api.risk_level === "MEDIUM",
  };
}

function mapPattern(api: ApiAssessmentPattern): AssessmentPatternResult {
  return {
    pattern: api.pattern,
    sourceAccount: api.source_account,
    collectorAccount: api.collector_account,
    intermediaryAccounts: api.intermediary_accounts ?? [],
    score: api.score,
    scoreMethod: api.score_method,
    evidence: api.evidence ?? null,
  };
}

function mapResponse(api: ApiAssessmentResponse, submitted: readonly Transaction[]): AssessmentResult {
  const accounts = (api.accounts ?? []).map(mapAccount);
  if (api.accounts_requiring_review) {
    const reviewSet = new Set(api.accounts_requiring_review);
    for (const account of accounts) {
      account.requiresReview = reviewSet.has(account.accountId);
    }
  }

  return {
    status: api.status,
    assessedAt: api.assessed_at,
    scoringMethod: api.model_mode ?? null,
    accounts,
    accountsRequiringReview:
      api.accounts_requiring_review ?? accounts.filter((a) => a.requiresReview).map((a) => a.accountId),
    patterns: (api.patterns ?? []).map(mapPattern),
    transactions: [...submitted],
  };
}

async function safeErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (body?.detail === undefined) return null;
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    return null;
  }
}

/**
 * Submits a batch of transactions for network-context risk assessment.
 * Genuinely calls the backend -- never fabricates a result. Since
 * `POST /api/assess` does not exist on the backend yet, this will currently
 * always resolve the "not-connected" branch below; that is the honest,
 * correct behavior, not a bug in this client.
 */
export async function submitAssessment(
  baseUrl: string,
  transactions: readonly Transaction[],
  signal?: AbortSignal,
): Promise<AssessmentResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}${ASSESSMENT_ENDPOINT_PATH}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiRequest(transactions)),
      signal,
    });
  } catch (cause) {
    throw new AssessmentApiError(
      `Could not reach the backend at ${baseUrl}. Is it running? (${(cause as Error).message})`,
      "network",
    );
  }

  if (response.status === 404 || response.status === 405) {
    throw new AssessmentApiError(
      `Assessment service not connected: the backend at ${baseUrl} does not implement ` +
        `${ASSESSMENT_ENDPOINT_PATH} yet (HTTP ${response.status}). Expected contract: ` +
        `POST ${ASSESSMENT_ENDPOINT_PATH} with body { "transactions": [{ "id", "sender", "receiver", ` +
        `"amount", "timestamp" }, ...] }, returning { "status", "assessed_at", "model_mode", ` +
        `"accounts": [{ "account_id", "risk_score", "risk_level", ... }], "patterns": [...] }. ` +
        `See frontend/docs/assessment-endpoint-contract.md for the full contract.`,
      "not-connected",
    );
  }

  if (response.status === 422) {
    const detail = (await safeErrorDetail(response)) ?? "the backend rejected the submitted transactions.";
    throw new AssessmentApiError(`Assessment request rejected: ${detail}`, "validation");
  }

  if (!response.ok) {
    const detail = (await safeErrorDetail(response)) ?? `HTTP ${response.status}`;
    throw new AssessmentApiError(`Assessment request failed: ${detail}`, "server");
  }

  const data = (await response.json()) as ApiAssessmentResponse;
  return mapResponse(data, transactions);
}
