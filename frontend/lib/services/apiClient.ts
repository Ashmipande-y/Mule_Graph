import type { ApiGraphResponse, ApiXgbScoreRequest, ApiXgbScoreResponse } from "@/types/api";
import type { GraphSnapshot } from "@/types/graph";
import type { XgbScoreResult } from "@/types/xgbScore";

export class LiveApiError extends Error {}

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
 * Fetches the live backend's graph snapshot. Never falls back to bundled
 * mock data on failure -- callers must surface the error/loading state
 * instead (see docs/api-contract.md: "must not silently fall back to a
 * bundled fixture").
 */
export async function fetchLiveGraph(baseUrl: string, signal?: AbortSignal): Promise<GraphSnapshot> {
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
  return mapApiGraph(data);
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
