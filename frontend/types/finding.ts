/**
 * A network-level piece of evidence, mirroring ml/rules/detector.py::Finding.
 * Describes one fan-out -> convergence pattern across several accounts,
 * backed by specific transactions. Kept distinct from AccountRisk (one
 * account's exposure across all findings it appears in) -- see
 * ml/rules/account_risk.py's module docstring.
 */
export interface Finding {
  pattern: "fan_out_convergence";
  sourceAccount: string;
  collectorAccount: string;
  intermediaryAccounts: string[];
  fanOutTransactionIds: string[];
  convergenceTransactionIds: string[];
  windowStart: string;
  windowEnd: string;
  /** Evidence-strength heuristic in [0, 1]. Not a calibrated probability. */
  score: number;
  scoreMethod: string;
  evidence: {
    intermediaryRatio: number;
    amountConservation: number;
    timeCompactness: number;
    totalFanOutAmount: number;
    totalConvergenceAmount: number;
    windowSpanSeconds: number;
    fanOutWindowSeconds: number;
    convergenceWindowSeconds: number;
  };
}
