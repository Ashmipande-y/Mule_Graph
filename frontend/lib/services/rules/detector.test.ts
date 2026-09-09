import { describe, expect, it } from "vitest";
import { CANONICAL_TRANSACTIONS } from "@/lib/services/dataSource";
import { toRuleTransactions } from "./transaction";
import { detectFanOutConvergence } from "./detector";
import { evaluateAt, observableTransactions } from "./replay";
import { accountRiskFromFindings, riskLevelForScore } from "./accountRisk";

const ruleTxs = toRuleTransactions(CANONICAL_TRANSACTIONS);
const ms = (iso: string) => Date.parse(iso);

describe("detectFanOutConvergence on the canonical fixture", () => {
  it("finds exactly one fan_out_convergence finding over the full dataset", () => {
    const findings = detectFanOutConvergence(ruleTxs);
    expect(findings).toHaveLength(1);
    expect(findings[0].pattern).toBe("fan_out_convergence");
    expect(findings[0].sourceAccount).toBe("ACC_A");
    expect(findings[0].collectorAccount).toBe("ACC_X");
    expect(findings[0].intermediaryAccounts).toEqual(["ACC_B", "ACC_C", "ACC_D"]);
  });

  it("matches the exact score verified in backend/docs/integration-contract.md (0.9317)", () => {
    const [finding] = detectFanOutConvergence(ruleTxs);
    expect(finding.score).toBeCloseTo(0.9317, 4);
  });

  it("scopes each intermediary's evidence to its own fan-out/convergence pair, not the whole finding", () => {
    const [finding] = detectFanOutConvergence(ruleTxs);
    expect(finding.fanOutTransactionIds).toEqual(["TX_002", "TX_003", "TX_004"]);
    expect(finding.convergenceTransactionIds).toEqual(["TX_005", "TX_006", "TX_007"]);
  });

  it("never references a specific account id in its logic (rejects being fixture-specific)", () => {
    const renamed = CANONICAL_TRANSACTIONS.map((tx) => ({
      ...tx,
      sender: tx.sender.replace("ACC_", "WALLET_"),
      receiver: tx.receiver.replace("ACC_", "WALLET_"),
    }));
    const findings = detectFanOutConvergence(toRuleTransactions(renamed));
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceAccount).toBe("WALLET_A");
  });

  it("does not inflate evidence when a transaction record is duplicated", () => {
    const duplicated = [...CANONICAL_TRANSACTIONS, CANONICAL_TRANSACTIONS[1]];
    const findings = detectFanOutConvergence(toRuleTransactions(duplicated));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.totalFanOutAmount).toBe(45000);
  });

  it("requires at least min_intermediaries converging accounts (no finding with only 2)", () => {
    const withoutOneLeg = CANONICAL_TRANSACTIONS.filter((tx) => tx.id !== "TX_004" && tx.id !== "TX_007");
    const findings = detectFanOutConvergence(toRuleTransactions(withoutOneLeg));
    expect(findings).toHaveLength(0);
  });
});

describe("replay: no-future-leakage", () => {
  it("observableTransactions excludes anything after asOf", () => {
    const asOf = ms("2026-01-01T10:00:10Z"); // exactly TX_004's timestamp
    const observed = observableTransactions(ruleTxs, asOf);
    expect(observed.map((t) => t.id)).toEqual(["TX_001", "TX_002", "TX_003", "TX_004"]);
  });

  it("shows no finding before any convergence transaction exists (only the fan-out half revealed)", () => {
    const asOf = ms("2026-01-01T10:00:10Z"); // TX_001..TX_004 revealed
    const findings = evaluateAt(ruleTxs, asOf);
    expect(findings).toHaveLength(0);
  });

  it("still shows no finding with only two of the three convergence legs revealed", () => {
    const asOf = ms("2026-01-01T10:00:18Z"); // through TX_006; TX_007 not yet revealed
    const findings = evaluateAt(ruleTxs, asOf);
    expect(findings).toHaveLength(0);
  });

  it("reveals the finding the instant the completing convergence transaction lands", () => {
    const asOf = ms("2026-01-01T10:00:21Z"); // through TX_007
    const findings = evaluateAt(ruleTxs, asOf);
    expect(findings).toHaveLength(1);
    expect(findings[0].score).toBeCloseTo(0.9317, 4);
  });

  it("never lets a later snapshot's evidence leak into an earlier one", () => {
    const early = evaluateAt(ruleTxs, ms("2026-01-01T10:00:20Z"));
    const late = evaluateAt(ruleTxs, ms("2026-01-01T10:00:21Z"));
    expect(early).toHaveLength(0);
    expect(late).toHaveLength(1);
  });
});

describe("account risk rollup", () => {
  it("maps the canonical finding's score to HIGH for every account in the pattern, UNASSESSED for the victim", () => {
    const findings = detectFanOutConvergence(ruleTxs);
    const accountRisk = accountRiskFromFindings(findings);

    for (const id of ["ACC_A", "ACC_B", "ACC_C", "ACC_D", "ACC_X"]) {
      const risk = accountRisk.get(id);
      expect(risk).toBeDefined();
      expect(risk!.riskLevel).toBe("HIGH");
      expect(risk!.maxScore).toBeCloseTo(0.9317, 4);
    }
    expect(accountRisk.has("ACC_VICTIM")).toBe(false);
  });

  it("riskLevelForScore matches the backend's provisional thresholds (0.75 / 0.4)", () => {
    expect(riskLevelForScore(0.8)).toBe("HIGH");
    expect(riskLevelForScore(0.75)).toBe("HIGH");
    expect(riskLevelForScore(0.74)).toBe("MEDIUM");
    expect(riskLevelForScore(0.4)).toBe("MEDIUM");
    expect(riskLevelForScore(0.39)).toBe("LOW");
    expect(riskLevelForScore(0)).toBe("LOW");
  });
});
