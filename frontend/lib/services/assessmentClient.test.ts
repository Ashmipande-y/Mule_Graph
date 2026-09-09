import { afterEach, describe, expect, it, vi } from "vitest";
import { AssessmentApiError, submitAssessment } from "./assessmentClient";
import type { Transaction } from "@/types/transaction";
import { CANONICAL_TRANSACTIONS } from "./dataSource";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response as Response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitAssessment: backend failure without mock fallback", () => {
  it("reports 'not connected' on 404 -- the current, real backend state -- and never fabricates a result", async () => {
    mockFetchOnce({ ok: false, status: 404, json: async () => ({ detail: "Not Found" }) });
    await expect(submitAssessment("http://127.0.0.1:8000", CANONICAL_TRANSACTIONS)).rejects.toThrow(AssessmentApiError);
    try {
      await submitAssessment("http://127.0.0.1:8000", CANONICAL_TRANSACTIONS);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AssessmentApiError);
      const apiError = error as AssessmentApiError;
      expect(apiError.kind).toBe("not-connected");
      expect(apiError.message).toMatch(/not connected/i);
      expect(apiError.message).toMatch(/POST \/api\/assess/);
    }
  });

  it("reports a network error distinctly when the backend is entirely unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    try {
      await submitAssessment("http://127.0.0.1:9999", CANONICAL_TRANSACTIONS);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AssessmentApiError);
      expect((error as AssessmentApiError).kind).toBe("network");
    }
  });

  it("surfaces a 422 validation error with the backend's own detail, not a generic message", async () => {
    mockFetchOnce({ ok: false, status: 422, json: async () => ({ detail: "amount must be a positive integer" }) });
    try {
      await submitAssessment("http://127.0.0.1:8000", CANONICAL_TRANSACTIONS);
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as AssessmentApiError).kind).toBe("validation");
      expect((error as AssessmentApiError).message).toMatch(/positive integer/);
    }
  });

  it("surfaces a 5xx server error distinctly", async () => {
    mockFetchOnce({ ok: false, status: 500, json: async () => ({ detail: "internal error" }) });
    try {
      await submitAssessment("http://127.0.0.1:8000", CANONICAL_TRANSACTIONS);
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as AssessmentApiError).kind).toBe("server");
    }
  });
});

describe("submitAssessment: multiple transactions and null/unassessed accounts", () => {
  it("maps a successful multi-transaction response, preserving null risk_score / UNASSESSED verbatim", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        assessed_at: "2026-01-01T10:05:00Z",
        model_mode: "rules",
        accounts: [
          { account_id: "ACC_A", risk_score: 0.9317, risk_level: "HIGH", roles: ["source"], finding_count: 1, evidence_transaction_ids: ["TX_002"] },
          { account_id: "ACC_VICTIM", risk_score: null, risk_level: "UNASSESSED", roles: [], finding_count: 0, evidence_transaction_ids: [] },
        ],
        patterns: [
          {
            pattern: "fan_out_convergence",
            source_account: "ACC_A",
            collector_account: "ACC_X",
            intermediary_accounts: ["ACC_B", "ACC_C", "ACC_D"],
            score: 0.9317,
          },
        ],
      }),
    });

    const result = await submitAssessment("http://127.0.0.1:8000", CANONICAL_TRANSACTIONS);

    expect(result.status).toBe("completed");
    expect(result.transactions).toHaveLength(CANONICAL_TRANSACTIONS.length);
    expect(result.patterns).toHaveLength(1);

    const victim = result.accounts.find((a) => a.accountId === "ACC_VICTIM");
    expect(victim?.riskScore).toBeNull();
    expect(victim?.riskLevel).toBe("UNASSESSED");
    expect(victim?.requiresReview).toBe(false); // never invented as needing review with no evidence

    const accA = result.accounts.find((a) => a.accountId === "ACC_A");
    expect(accA?.riskScore).toBe(0.9317);
    expect(accA?.requiresReview).toBe(true); // derived from HIGH, not fabricated
  });

  it("respects an explicit accounts_requiring_review list over the derived HIGH/MEDIUM heuristic", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        assessed_at: "2026-01-01T10:05:00Z",
        accounts: [{ account_id: "ACC_LOW", risk_score: 0.1, risk_level: "LOW" }],
        accounts_requiring_review: ["ACC_LOW"],
      }),
    });
    const result = await submitAssessment("http://127.0.0.1:8000", CANONICAL_TRANSACTIONS.slice(0, 1) as Transaction[]);
    expect(result.accounts[0].requiresReview).toBe(true);
    expect(result.accountsRequiringReview).toEqual(["ACC_LOW"]);
  });

  it("never invents a scoring method when the response doesn't report one", async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => ({ status: "completed", assessed_at: "2026-01-01T10:05:00Z", accounts: [] }) });
    const result = await submitAssessment("http://127.0.0.1:8000", []);
    expect(result.scoringMethod).toBeNull();
    expect(result.patterns).toEqual([]);
  });
});
