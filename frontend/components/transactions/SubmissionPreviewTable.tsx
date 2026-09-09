"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/States";
import { formatFullUtc, formatINR } from "@/lib/format";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";

export interface SubmissionPreviewTableProps {
  networkTransactions: readonly Transaction[];
  pendingTransactions: readonly Transaction[];
  onEditPending: (id: string) => void;
  onRemovePending: (id: string) => void;
  className?: string;
}

/**
 * Shows exactly what "Run risk assessment" will submit: read-only rows for
 * the current network (context only -- not editable here) plus editable
 * rows for pending, analyst-entered transactions. This is the "review the
 * exact transaction set" surface, not a duplicate of the main app table.
 */
export function SubmissionPreviewTable({
  networkTransactions,
  pendingTransactions,
  onEditPending,
  onRemovePending,
  className,
}: SubmissionPreviewTableProps) {
  if (networkTransactions.length === 0 && pendingTransactions.length === 0) {
    return (
      <EmptyState
        title="Nothing to submit yet"
        description="Add a transaction, or load the example network, to build an assessment."
        className={className}
      />
    );
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <Table>
        <caption className="sr-only">Transactions that will be submitted for risk assessment.</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Sender</TableHead>
            <TableHead>Receiver</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Timestamp (UTC)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {networkTransactions.map((tx) => (
            <TableRow key={`network-${tx.id}`} className="text-muted-foreground">
              <TableCell>
                <span className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-medium">Network</span>
              </TableCell>
              <TableCell className="font-data">{tx.id}</TableCell>
              <TableCell className="font-data">{tx.sender}</TableCell>
              <TableCell className="font-data">{tx.receiver}</TableCell>
              <TableCell className="text-right font-data">{formatINR(tx.amount)}</TableCell>
              <TableCell className="font-data">{formatFullUtc(tx.timestamp)}</TableCell>
              <TableCell />
            </TableRow>
          ))}
          {pendingTransactions.map((tx) => (
            <TableRow key={`pending-${tx.id}`}>
              <TableCell>
                <span className="rounded border border-status-info/30 bg-status-info/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-status-info">
                  Pending
                </span>
              </TableCell>
              <TableCell className="font-data text-foreground">{tx.id}</TableCell>
              <TableCell className="font-data text-foreground">{tx.sender}</TableCell>
              <TableCell className="font-data text-foreground">{tx.receiver}</TableCell>
              <TableCell className="text-right font-data text-foreground">{formatINR(tx.amount)}</TableCell>
              <TableCell className="font-data text-foreground">{formatFullUtc(tx.timestamp)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${tx.id}`}
                    onClick={() => onEditPending(tx.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${tx.id}`}
                    onClick={() => onRemovePending(tx.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
