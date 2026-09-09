import { describe, expect, it } from "vitest";
import { CANONICAL_TRANSACTIONS } from "@/lib/services/dataSource";
import { toRuleTransactions } from "./rules/transaction";
import { detectFanOutConvergence } from "./rules/detector";
import { deriveAlerts } from "./alerts";

const ruleTxs = toRuleTransactions(CANONICAL_TRANSACTIONS);
const findings = detectFanOutConvergence(ruleTxs);

describe("deriveAlerts", () => {
  it("defaults to reporting a real replay step position", () => {
    const alerts = deriveAlerts(findings, CANONICAL_TRANSACTIONS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].revealedAtStep).not.toBeNull();
    expect(typeof alerts[0].revealedAtStep).toBe("number");
  });

  it("reports null revealedAtStep when isReplayPosition is false (a one-shot dataset, e.g. live mode)", () => {
    const alerts = deriveAlerts(findings, CANONICAL_TRANSACTIONS, { isReplayPosition: false });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].revealedAtStep).toBeNull();
  });

  it("still requires a completing transaction to be present in the given set either way", () => {
    // Drop every convergence transaction (TX_005/006/007) -- none of the
    // candidates for "the transaction that completed this finding's
    // evidence" are present, so no alert should be reported regardless of
    // isReplayPosition.
    const partial = CANONICAL_TRANSACTIONS.filter((tx) => !["TX_005", "TX_006", "TX_007"].includes(tx.id));
    expect(deriveAlerts(findings, partial, { isReplayPosition: false })).toHaveLength(0);
    expect(deriveAlerts(findings, partial)).toHaveLength(0);
  });

  it("produces no alerts when there are no findings", () => {
    expect(deriveAlerts([], CANONICAL_TRANSACTIONS)).toEqual([]);
  });
});
