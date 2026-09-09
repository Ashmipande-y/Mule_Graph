import type { RiskLevel } from "./risk";

/**
 * Mirrors docs/api-contract.md's Node shape exactly (camelCase internally;
 * see lib/services/api-client.ts for the wire-format mapping).
 */
export interface GraphNode {
  id: string;
  label: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
}

/** Mirrors docs/api-contract.md's Edge shape. One edge per transaction. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
