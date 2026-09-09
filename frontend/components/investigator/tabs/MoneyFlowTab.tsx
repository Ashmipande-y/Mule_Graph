"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatClockUtc, formatINR } from "@/lib/format";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";

/**
 * The brief this workspace is modeled on asked for a monthly inbound/outbound
 * volume chart -- this canonical demo spans 21 seconds, not months, so a
 * monthly bucket would be either empty or misleading. Bucketed by account
 * instead: real inbound vs. outbound totals per account in the network,
 * which is the actual shape this dataset can support honestly.
 */
export function MoneyFlowTab({ scenario }: { scenario: InvestigatorScenario }) {
  const { allTransactions, graph } = scenario;

  const byAccount = graph.nodes.map((node) => {
    const inbound = allTransactions.filter((tx) => tx.receiver === node.id).reduce((sum, tx) => sum + tx.amount, 0);
    const outbound = allTransactions.filter((tx) => tx.sender === node.id).reduce((sum, tx) => sum + tx.amount, 0);
    return { account: node.id, inbound, outbound };
  });

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Inbound vs. outbound volume, per account
        </h3>
        <div className="h-56 rounded-md border border-border bg-panel-2 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byAccount}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="account" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value) => formatINR(Number(value))}
                contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 12 }}
              />
              <Bar dataKey="inbound" fill="var(--status-live)" name="Inbound" />
              <Bar dataKey="outbound" fill="var(--risk-medium)" name="Outbound" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Transfers ({allTransactions.length})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Receiver</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Flagged</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allTransactions.map((tx) => {
              const isEvidence = scenario.strict.transactionIds.includes(tx.id);
              return (
                <TableRow key={tx.id}>
                  <TableCell className="font-data text-muted-foreground">{formatClockUtc(tx.timestamp)}</TableCell>
                  <TableCell className="font-data">{tx.id}</TableCell>
                  <TableCell className="font-data">{tx.sender}</TableCell>
                  <TableCell className="font-data">{tx.receiver}</TableCell>
                  <TableCell className="text-muted-foreground">UPI</TableCell>
                  <TableCell className="text-right font-data">{formatINR(tx.amount)}</TableCell>
                  <TableCell>
                    {isEvidence ? (
                      <span className="text-[0.65rem] font-medium text-risk-high">Evidence</span>
                    ) : (
                      <span className="text-[0.65rem] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
