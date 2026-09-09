"use client";

import { useState } from "react";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { labelFor } from "@/lib/services/labels";
import { formatScore } from "@/lib/format";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";

export function NetworkTab({ scenario }: { scenario: InvestigatorScenario }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(scenario.flaggedAccountId);
  const { graph, accountRisk } = scenario;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="relative min-h-[280px] flex-1 rounded-md border border-border">
        <GraphCanvas
          graph={graph}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          className="absolute inset-0"
        />
        <div className="absolute bottom-2 left-2 rounded-md border border-border bg-panel/95 p-2 shadow-sm">
          <GraphLegend />
        </div>
      </div>
      <p className="text-[0.65rem] text-muted-foreground">
        This is the real transaction graph (accounts as nodes, transfers as directed edges). Shared-device/IP correlation
        lines are not shown — this dataset has no device or IP telemetry to draw them from.
      </p>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Connected accounts ({graph.nodes.length})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="text-right">Evidence score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {graph.nodes.map((node) => {
              const risk = accountRisk.get(node.id);
              return (
                <TableRow
                  key={node.id}
                  data-selected={node.id === selectedAccountId}
                  className="cursor-pointer"
                  onClick={() => setSelectedAccountId(node.id)}
                >
                  <TableCell className="font-data">{node.id}</TableCell>
                  <TableCell>{labelFor(node.id)}</TableCell>
                  <TableCell className="text-muted-foreground">{risk ? risk.roles.join(", ") : "—"}</TableCell>
                  <TableCell>
                    <RiskBadge level={node.riskLevel} showIcon={false} />
                  </TableCell>
                  <TableCell className="text-right font-data">{formatScore(node.riskScore)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
