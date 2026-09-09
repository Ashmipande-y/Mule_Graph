import type {
  AmlAssessResult,
  AmlDatasetSummary,
  AmlGraphSnapshot,
  AmlLabeledNetworksResult,
  AmlTransaction,
  AmlTransactionPage,
  ApiAmlAssessResponse,
  ApiAmlDatasetSummaryResponse,
  ApiAmlGraphResponse,
  ApiAmlLabeledNetworksResponse,
  ApiAmlSessionCommitResponse,
  ApiAmlTransaction,
  ApiAmlTransactionListResponse,
} from "@/types/aml";

export type AmlErrorKind = "not-found" | "validation" | "conflict" | "model-unavailable" | "server" | "network";

export class AmlApiError extends Error {
  readonly kind: AmlErrorKind;
  readonly field?: string;
  constructor(message: string, kind: AmlErrorKind, field?: string) {
    super(message);
    this.kind = kind;
    this.field = field;
  }
}

function mapTransaction(api: ApiAmlTransaction): AmlTransaction {
  return {
    id: api.id,
    sender: api.sender,
    receiver: api.receiver,
    amountPaise: api.amount_paise,
    currency: api.currency,
    timestamp: api.timestamp,
    paymentFormat: api.payment_format,
    isLabeledLaundering: api.is_labeled_laundering ?? false,
  };
}

function toApiTransaction(tx: AmlTransaction): ApiAmlTransaction {
  return {
    id: tx.id,
    sender: tx.sender,
    receiver: tx.receiver,
    amount_paise: tx.amountPaise,
    currency: tx.currency,
    timestamp: tx.timestamp,
    payment_format: tx.paymentFormat,
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (cause) {
    throw new AmlApiError(`Could not reach the backend at ${url}. Is it running? (${(cause as Error).message})`, "network");
  }

  if (response.status === 503) {
    const detail = await safeDetail(response);
    throw new AmlApiError(detail ?? "The AML model is not available on this server.", "model-unavailable");
  }
  if (response.status === 409) {
    const detail = await safeDetail(response);
    throw new AmlApiError(detail ?? "Conflict.", "conflict");
  }
  if (response.status === 422) {
    const detail = await safeDetail(response);
    throw new AmlApiError(detail ?? "The backend rejected this request.", "validation");
  }
  if (response.status === 404) {
    throw new AmlApiError("Not found.", "not-found");
  }
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new AmlApiError(detail ?? `HTTP ${response.status}`, "server");
  }

  return (await response.json()) as T;
}

async function safeDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (body?.detail === undefined) return null;
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    return null;
  }
}

function base(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function fetchAmlSummary(baseUrl: string): Promise<AmlDatasetSummary> {
  const data = await request<ApiAmlDatasetSummaryResponse>(`${base(baseUrl)}/api/aml/summary`);
  return {
    label: data.label,
    source: data.source,
    currency: data.currency,
    amountUnit: data.amount_unit,
    timestampTimezoneNote: data.timestamp_timezone_note,
    totalTransactions: data.total_transactions,
    totalAccounts: data.total_accounts,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    sessionTransactionCount: data.session_transaction_count,
    scoringMethod: data.scoring_method,
    modelAvailable: data.model_available,
    modelVersion: data.model_version,
  };
}

export interface ListAmlTransactionsParams {
  after?: string;
  before?: string;
  account?: string;
  cursor?: number;
  limit?: number;
}

export async function fetchAmlTransactions(baseUrl: string, params: ListAmlTransactionsParams = {}): Promise<AmlTransactionPage> {
  const query = new URLSearchParams();
  if (params.after) query.set("after", params.after);
  if (params.before) query.set("before", params.before);
  if (params.account) query.set("account", params.account);
  if (params.cursor !== undefined) query.set("cursor", String(params.cursor));
  if (params.limit !== undefined) query.set("limit", String(params.limit));

  const data = await request<ApiAmlTransactionListResponse>(`${base(baseUrl)}/api/aml/transactions?${query.toString()}`);
  return {
    items: data.items.map(mapTransaction),
    nextCursor: data.next_cursor,
    totalMatching: data.total_matching,
  };
}

export interface FetchAmlGraphParams {
  account?: string;
  maxNodes?: number;
  maxEdges?: number;
}

export async function fetchAmlGraph(baseUrl: string, params: FetchAmlGraphParams = {}): Promise<AmlGraphSnapshot> {
  const query = new URLSearchParams();
  if (params.account) query.set("account", params.account);
  if (params.maxNodes !== undefined) query.set("max_nodes", String(params.maxNodes));
  if (params.maxEdges !== undefined) query.set("max_edges", String(params.maxEdges));

  const data = await request<ApiAmlGraphResponse>(`${base(baseUrl)}/api/aml/graph?${query.toString()}`);
  return {
    nodes: data.nodes.map((n) => ({ id: n.id, label: n.label, riskScore: n.risk_score, riskLevel: n.risk_level })),
    edges: data.edges.map(mapTransaction),
    seedAccount: data.seed_account,
    rulesFindings: data.rules_findings.map((f) => ({
      pattern: f.pattern,
      sourceAccount: f.source_account,
      collectorAccount: f.collector_account,
      intermediaryAccounts: f.intermediary_accounts,
      score: f.score,
      scoreMethod: f.score_method,
      evidence: f.evidence,
    })),
  };
}

/**
 * Scores proposed transactions -- never commits them. See
 * backend/docs/aml-integration-contract.md's assessment semantics: a batch
 * is scored as if each transaction were assessed one at a time, in order.
 */
export async function assessAmlTransactions(baseUrl: string, transactions: AmlTransaction[]): Promise<AmlAssessResult> {
  const data = await request<ApiAmlAssessResponse>(`${base(baseUrl)}/api/aml/assess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: transactions.map(toApiTransaction) }),
  });
  return {
    status: data.status,
    assessedAt: data.assessed_at,
    modelVersion: data.model_version,
    threshold: data.threshold,
    notACalibratedProbabilityNote: data.not_a_calibrated_probability_note,
    results: data.results.map((r) => ({
      transactionId: r.transaction_id,
      score: r.score,
      isLaundering: r.is_laundering,
      threshold: r.threshold,
      modelVersion: r.model_version,
      features: r.features,
    })),
  };
}

/**
 * Real neighborhoods discovered from the benchmark's own ground-truth
 * is_laundering labels -- an independent, equally real notion of
 * "suspicious" from ml/rules' own conclusion about the same neighborhood
 * (see backend/app/api/aml.py::get_labeled_networks for why).
 */
export async function fetchAmlLabeledNetworks(baseUrl: string, maxResults = 8): Promise<AmlLabeledNetworksResult> {
  const data = await request<ApiAmlLabeledNetworksResponse>(
    `${base(baseUrl)}/api/aml/labeled-networks?max_results=${maxResults}`,
  );
  return {
    sourceNote: data.source_note,
    networks: data.networks.map((n) => ({
      seedAccount: n.seed_account,
      labeledLaunderingTransactionCount: n.labeled_laundering_transaction_count,
      accountCount: n.account_count,
      edgeCount: n.edge_count,
      mlRulesRiskLevel: n.ml_rules_risk_level,
    })),
  };
}

/** Commits transactions to session-local history (distinct from assess -- see the contract doc). */
export async function commitAmlTransactions(baseUrl: string, transactions: AmlTransaction[]): Promise<AmlTransaction[]> {
  const data = await request<ApiAmlSessionCommitResponse>(`${base(baseUrl)}/api/aml/session/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: transactions.map(toApiTransaction) }),
  });
  return data.committed.map(mapTransaction);
}
