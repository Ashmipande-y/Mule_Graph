"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NoResultsState } from "@/components/shared/States";
import { formatClockUtc, formatINR } from "@/lib/format";
import type { GraphNode } from "@/types/graph";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";

export interface TransactionTableProps {
  transactions: readonly Transaction[];
  nodesById: ReadonlyMap<string, GraphNode>;
  selectedTransactionId: string | null;
  onSelectTransaction: (id: string) => void;
  onSelectAccount?: (id: string) => void;
  searchQuery?: string;
  className?: string;
  dense?: boolean;
}

const riskDotClass: Record<string, string> = {
  HIGH: "bg-risk-high",
  MEDIUM: "bg-risk-medium",
  LOW: "bg-risk-low",
  UNASSESSED: "bg-risk-unassessed",
};

export function TransactionTable({
  transactions,
  nodesById,
  selectedTransactionId,
  onSelectTransaction,
  onSelectAccount,
  searchQuery,
  className,
  dense = false,
}: TransactionTableProps) {
  if (transactions.length === 0 && searchQuery) {
    return <NoResultsState query={searchQuery} className={className} />;
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <Table>
        <caption className="sr-only">Transactions revealed so far, most recent activity reflected in risk levels.</caption>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Time (UTC)</TableHead>
            <TableHead>Sender</TableHead>
            <TableHead>Receiver</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const senderRisk = nodesById.get(tx.sender)?.riskLevel ?? "UNASSESSED";
            const receiverRisk = nodesById.get(tx.receiver)?.riskLevel ?? "UNASSESSED";
            return (
              <TableRow
                key={tx.id}
                tabIndex={0}
                role="button"
                aria-label={`Inspect transaction ${tx.id}, ${formatINR(tx.amount)} from ${tx.sender} to ${tx.receiver}`}
                aria-pressed={tx.id === selectedTransactionId}
                onClick={() => onSelectTransaction(tx.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectTransaction(tx.id);
                  }
                }}
                className={cn(
                  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                  dense && "*:py-1",
                  tx.id === selectedTransactionId && "bg-accent",
                )}
              >
                <TableCell className="font-data">{tx.id}</TableCell>
                <TableCell className="font-data text-muted-foreground">{formatClockUtc(tx.timestamp)}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAccount?.(tx.sender);
                    }}
                    className="flex items-center gap-1.5 font-data hover:underline"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", riskDotClass[senderRisk])} aria-hidden="true" />
                    {tx.sender}
                  </button>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAccount?.(tx.receiver);
                    }}
                    className="flex items-center gap-1.5 font-data hover:underline"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", riskDotClass[receiverRisk])} aria-hidden="true" />
                    {tx.receiver}
                  </button>
                </TableCell>
                <TableCell className="text-right font-data">{formatINR(tx.amount)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
