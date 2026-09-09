import type { GraphSnapshot } from "@/types/graph";
import type { AmlGraphSnapshot } from "@/types/aml";

/**
 * Maps the AML dataset's graph shape onto the existing canonical-demo
 * `GraphSnapshot` type so the same `GraphCanvas`/`GraphAccessibleList`
 * components render both -- one visual language, per "preserve the current
 * MuleGraph design." `amount` here is `amountPaise` (paise): GraphCanvas
 * only ever uses it as a relative log-scale line-width heuristic, so the
 * unit doesn't matter for that purpose, and no INR conversion or rounding
 * happens in this mapping (display components format paise separately).
 */
export function amlGraphToGraphSnapshot(aml: AmlGraphSnapshot): GraphSnapshot {
  return {
    nodes: aml.nodes.map((n) => ({ id: n.id, label: n.label, riskScore: n.riskScore, riskLevel: n.riskLevel })),
    edges: aml.edges.map((e) => ({ id: e.id, source: e.sender, target: e.receiver, amount: e.amountPaise, timestamp: e.timestamp })),
  };
}
