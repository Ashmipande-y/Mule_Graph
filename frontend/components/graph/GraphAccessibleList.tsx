"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { formatScore } from "@/lib/format";
import type { GraphSnapshot } from "@/types/graph";
import { cn } from "@/lib/utils";

export interface GraphAccessibleListProps {
  graph: GraphSnapshot;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  className?: string;
}

/**
 * A text/table equivalent of the canvas graph, per the accessibility
 * requirement that graph information be available through an accessible
 * list as well as the canvas -- screen readers and keyboard-only users get
 * the same node/edge data a sighted mouse user gets from the canvas.
 */
export function GraphAccessibleList({ graph, selectedAccountId, onSelectAccount, className }: GraphAccessibleListProps) {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <Table>
        <caption className="sr-only">
          Accounts in the current transaction graph, with risk level and connection count. Activate a row to inspect
          that account.
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Connections</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {graph.nodes.map((node) => (
            <TableRow
              key={node.id}
              data-selected={node.id === selectedAccountId}
              tabIndex={0}
              role="button"
              aria-pressed={node.id === selectedAccountId}
              aria-label={`Inspect account ${node.label}, ${node.id}, risk ${node.riskLevel}`}
              onClick={() => onSelectAccount(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectAccount(node.id);
                }
              }}
              className={cn(
                "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                node.id === selectedAccountId && "bg-accent",
              )}
            >
              <TableCell className="font-data">{node.id}</TableCell>
              <TableCell>{node.label}</TableCell>
              <TableCell>
                <RiskBadge level={node.riskLevel} />
              </TableCell>
              <TableCell className="text-right font-data">{formatScore(node.riskScore)}</TableCell>
              <TableCell className="text-right font-data">{degree.get(node.id) ?? 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
