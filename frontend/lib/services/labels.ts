/**
 * Authored scenario labels for the demo UI -- mirrors
 * backend/app/services/graph.py::CANONICAL_LABELS exactly. Display text
 * only; never used as model features or to influence detection.
 */
export const CANONICAL_LABELS: Record<string, string> = {
  ACC_VICTIM: "Victim",
  ACC_A: "Account A",
  ACC_B: "Account B",
  ACC_C: "Account C",
  ACC_D: "Account D",
  ACC_X: "Collector X",
};

export function labelFor(accountId: string): string {
  return CANONICAL_LABELS[accountId] ?? accountId;
}
