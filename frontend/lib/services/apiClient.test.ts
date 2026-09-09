import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBackendHealth, fetchLiveGraph, LiveApiError, mapApiGraph, postXgbScore, XgbScoreApiError } from "./apiClient";
import type { ApiGraphResponse } from "@/types/api";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapApiGraph", () => {
  it("maps snake_case wire fields to camelCase without recomputing risk", () => {
    const api: ApiGraphResponse = {
      nodes: [{ id: "ACC_A", label: "Account A", risk_score: 0.9317, risk_level: "HIGH" }],
      edges: [{ id: "TX_001", source: "ACC_A", target: "ACC_B", amount: 100, timestamp: "2026-01-01T10:00:00Z" }],
    };
    const mapped = mapApiGraph(api);
    expect(mapped.nodes[0]).toEqual({ id: "ACC_A", label: "Account A", riskScore: 0.9317, riskLevel: "HIGH" });
    expect(mapped.edges[0].source).toBe("ACC_A");
  });

  it("preserves null risk_score / UNASSESSED verbatim (never substitutes a zero score)", () => {
    const api: ApiGraphResponse = {
      nodes: [{ id: "ACC_VICTIM", label: "Victim", risk_score: null, risk_level: "UNASSESSED" }],
      edges: [],
    };
    const mapped = mapApiGraph(api);
    expect(mapped.nodes[0].riskScore).toBeNull();
    expect(mapped.nodes[0].riskLevel).toBe("UNASSESSED");
  });
});

describe("fetchLiveGraph", () => {
  it("returns the mapped graph on a 200 response", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ nodes: [], edges: [] }) satisfies ApiGraphResponse,
    });
    const result = await fetchLiveGraph("http://127.0.0.1:8000");
    expect(result.graph).toEqual({ nodes: [], edges: [] });
    expect(result.findings).toEqual([]);
  });

  it("maps real findings alongside the graph, field-for-field, from the same response", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () =>
        ({
          nodes: [],
          edges: [],
          findings: [
            {
              pattern: "fan_out_convergence",
              source_account: "ACC_A",
              collector_account: "ACC_X",
              intermediary_accounts: ["ACC_B", "ACC_C", "ACC_D"],
              fan_out_transaction_ids: ["TX_002", "TX_003", "TX_004"],
              convergence_transaction_ids: ["TX_005", "TX_006", "TX_007"],
              window_start: "2026-01-01T10:00:04Z",
              window_end: "2026-01-01T10:00:21Z",
              score: 0.9317,
              score_method: "heuristic_v1",
              evidence: {
                intermediary_ratio: 1.0,
                amount_conservation: 0.8667,
                time_compactness: 0.8583,
                total_fan_out_amount: 45000,
                total_convergence_amount: 39000,
                window_span_seconds: 17,
                fan_out_window_seconds: 60,
                convergence_window_seconds: 60,
              },
            },
          ],
        }) satisfies ApiGraphResponse,
    });
    const result = await fetchLiveGraph("http://127.0.0.1:8000");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      pattern: "fan_out_convergence",
      sourceAccount: "ACC_A",
      collectorAccount: "ACC_X",
      intermediaryAccounts: ["ACC_B", "ACC_C", "ACC_D"],
      fanOutTransactionIds: ["TX_002", "TX_003", "TX_004"],
      convergenceTransactionIds: ["TX_005", "TX_006", "TX_007"],
      windowStart: "2026-01-01T10:00:04Z",
      windowEnd: "2026-01-01T10:00:21Z",
      score: 0.9317,
      scoreMethod: "heuristic_v1",
      evidence: {
        intermediaryRatio: 1.0,
        amountConservation: 0.8667,
        timeCompactness: 0.8583,
        totalFanOutAmount: 45000,
        totalConvergenceAmount: 39000,
        windowSpanSeconds: 17,
        fanOutWindowSeconds: 60,
        convergenceWindowSeconds: 60,
      },
    });
  });

  it("throws LiveApiError with the server's detail on a non-2xx response", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "transaction source data is unavailable or malformed" }),
    });
    await expect(fetchLiveGraph("http://127.0.0.1:8000")).rejects.toThrow(LiveApiError);
    await expect(fetchLiveGraph("http://127.0.0.1:8000")).rejects.toThrow(/unavailable or malformed/);
  });

  it("throws LiveApiError (not a silent fallback) when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await expect(fetchLiveGraph("http://127.0.0.1:8000")).rejects.toThrow(LiveApiError);
    await expect(fetchLiveGraph("http://127.0.0.1:8000")).rejects.toThrow(/Could not reach the backend/);
  });
});

describe("postXgbScore", () => {
  it("maps a successful score response to camelCase, distinct from mule-network risk", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ score: 0.999926, is_fraud: true, threshold: 0.95, model_mode: "xgboost_card_fraud_baseline" }),
    });
    const result = await postXgbScore("http://127.0.0.1:8000", { time: 146022, amount: 1.18, v: Array(28).fill(0) });
    expect(result).toEqual({ score: 0.999926, isFraud: true, threshold: 0.95, modelMode: "xgboost_card_fraud_baseline" });
  });

  it("throws a specific model-unavailable error on 503", async () => {
    mockFetchOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(
      postXgbScore("http://127.0.0.1:8000", { time: 0, amount: 0, v: Array(28).fill(0) }),
    ).rejects.toThrow(XgbScoreApiError);
    await expect(
      postXgbScore("http://127.0.0.1:8000", { time: 0, amount: 0, v: Array(28).fill(0) }),
    ).rejects.toThrow(/not available/);
  });

  it("surfaces validation detail on 422", async () => {
    mockFetchOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: [{ msg: "ensure this value has at least 28 items" }] }),
    });
    await expect(
      postXgbScore("http://127.0.0.1:8000", { time: 0, amount: 0, v: [] }),
    ).rejects.toThrow(/28 items/);
  });
});

describe("checkBackendHealth", () => {
  it("returns true when the backend reports ok", async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    await expect(checkBackendHealth("http://127.0.0.1:8000")).resolves.toBe(true);
  });

  it("returns false when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(checkBackendHealth("http://127.0.0.1:8000")).resolves.toBe(false);
  });
});
