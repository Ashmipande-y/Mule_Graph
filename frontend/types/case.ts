import type { Finding } from "./finding";

/**
 * A case is derived 1:1 from a detected Finding -- never fabricated or
 * duplicated. With the canonical dataset there is exactly one underlying
 * network, so there is exactly one case once its evidence is fully
 * revealed, and zero before that.
 */
export interface CaseSummary {
  id: string;
  title: string;
  pattern: string;
  accountIds: string[];
  primaryFinding: Finding;
}
