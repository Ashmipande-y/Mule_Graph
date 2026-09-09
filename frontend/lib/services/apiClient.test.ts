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
    const graph = await fetchLiveGraph("http://127.0.0.1:8000");
    expect(graph).toEqual({ nodes: [], edges: [] });
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
