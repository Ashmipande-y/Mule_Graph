import type { Finding } from "./finding";
import type { RiskLevel } from "./risk";

/**
 * An analyst-facing alert derived from a Finding once its evidence has been
 * revealed by replay. Identity is derived from the finding's own evidence
 * (source/collector/intermediaries), not from when it was detected, so it
 * stays stable across re-evaluation -- see backend/README.md Stage 2:
 * "Keep stable evidence-based alert identity."
 */
export interface Alert {
  id: string;
  finding: Finding;
  level: RiskLevel;
  /** The transaction whose arrival completed this pattern's evidence. */
  revealedByTransactionId: string;
  /**
   * 1-based position of that transaction in the replay sequence, or `null`
   * when the active dataset isn't a replay (live mode's one-shot snapshot
   * has no meaningful "step") -- see `deriveAlerts`'s `isReplayPosition`
   * option.
   */
  revealedAtStep: number | null;
  title: string;
  summary: string;
}
