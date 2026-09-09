import type { ApiFinding, ApiGraphResponse, ApiXgbScoreRequest, ApiXgbScoreResponse } from "@/types/api";
import type { GraphSnapshot } from "@/types/graph";
import type { XgbScoreResult } from "@/types/xgbScore";
import type { Finding } from "./rules/detector";

export class LiveApiError extends Error {}

export interface LiveGraphResult {
  graph: GraphSnapshot;
  findings: Finding[];
}

/**
 * Maps one wire-shape finding to the internal `Finding` type
 * (lib/services/rules/detector.ts), field-for-field, so live mode can reuse
 * the exact same alert/case derivation as simulation mode instead of a
 * second, live-only code path. `evidence`'s numeric fields default to 0 only
 * as a defensive fallback against a schema-shape drift bug -- the backend's
 * `GraphFinding.evidence` (backend/app/schemas.py) always includes all eight
 * keys for a real finding, verified by backend/tests/test_graph.py.
 */
export function mapApiFinding(f: ApiFinding): Finding {
  const evidenceNumber = (key: string): number => {
    const value = f.evidence[key];
    return typeof value === "number" ? value : 0;
  };
  return {
    pattern: "fan_out_convergence",
    sourceAccount: f.source_account,
    collectorAccount: f.collector_account,
    intermediaryAccounts: f.intermediary_accounts,
    fanOutTransactionIds: f.fan_out_transaction_ids,
    convergenceTransactionIds: f.convergence_transaction_ids,
    windowStart: f.window_start,
    windowEnd: f.window_end,
    score: f.score,
    scoreMethod: f.score_method,
    evidence: {
      intermediaryRatio: evidenceNumber("intermediary_ratio"),
      amountConservation: evidenceNumber("amount_conservation"),
      timeCompactness: evidenceNumber("time_compactness"),
      totalFanOutAmount: evidenceNumber("total_fan_out_amount"),
      totalConvergenceAmount: evidenceNumber("total_convergence_amount"),
      windowSpanSeconds: evidenceNumber("window_span_seconds"),
      fanOutWindowSeconds: evidenceNumber("fan_out_window_seconds"),
      convergenceWindowSeconds: evidenceNumber("convergence_window_seconds"),
    },
  };
}

export class XgbScoreApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Maps the backend's wire shape (snake_case, docs/api-contract.md) to our
 * internal camelCase GraphSnapshot. Values are passed through verbatim --
 * risk_score/risk_level are never recomputed or remapped client-side, per
 * "Preserve scores and levels returned by an API adapter instead of
 * silently remapping them."
 */
export function mapApiGraph(api: ApiGraphResponse): GraphSnapshot {
  return {
    nodes: api.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      riskScore: n.risk_score,
      riskLevel: n.risk_level,
    })),
    edges: api.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      amount: e.amount,
      timestamp: e.timestamp,
    })),
  };
}

/**
 * Fetches the live backend's graph snapshot, plus the real network-level
 * findings backing it (see `mapApiFinding` above) -- both come from the same
 * response so a caller never ends up with a graph from one fetch and
 * findings from another. Never falls back to bundled mock data on failure --
 * callers must surface the error/loading state instead (see
 * docs/api-contract.md: "must not silently fall back to a bundled fixture").
 */
export async function fetchLiveGraph(baseUrl: string, signal?: AbortSignal): Promise<LiveGraphResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/graph`;
  let response: Response;
  try {
    response = await fetch(url, { signal, cache: "no-store" });
  } catch (cause) {
    throw new LiveApiError(
      `Could not reach the backend at ${baseUrl}. Is it running? (${(cause as Error).message})`,
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // response body wasn't JSON; keep the HTTP status as the detail
    }
    throw new LiveApiError(`Live graph request failed: ${detail}`);
  }

  const data = (await response.json()) as ApiGraphResponse;
  return { graph: mapApiGraph(data), findings: (data.findings ?? []).map(mapApiFinding) };
}

/**
 * Scores one card-present transaction row with the standalone
 * ml/xgb_baseline model via `POST /api/xgb-score`. This is NOT mule-network
 * risk and must never be merged with a GraphNode's riskScore/riskLevel --
 * see backend/docs/integration-contract.md.
 */
export async function postXgbScore(
  baseUrl: string,
  request: ApiXgbScoreRequest,
  signal?: AbortSignal,
): Promise<XgbScoreResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/xgb-score`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (cause) {
    throw new XgbScoreApiError(
      `Could not reach the backend at ${baseUrl}. Is it running? (${(cause as Error).message})`,
    );
  }

  if (response.status === 503) {
    throw new XgbScoreApiError(
      "The XGBoost baseline model is not available on this server (optional dependencies or the trained model file are missing).",
      503,
    );
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // response body wasn't JSON; keep the HTTP status as the detail
    }
    throw new XgbScoreApiError(`Score request failed: ${detail}`, response.status);
  }

  const data = (await response.json()) as ApiXgbScoreResponse;
  return { score: data.score, isFraud: data.is_fraud, threshold: data.threshold, modelMode: data.model_mode };
}

/** Lightweight connectivity check against the backend's `/health`. */
export async function checkBackendHealth(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal, cache: "no-store" });
    if (!response.ok) return false;
    const data = (await response.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}
