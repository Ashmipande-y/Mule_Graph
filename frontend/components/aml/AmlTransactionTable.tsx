"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/shared/States";
import { formatClockUtc } from "@/lib/format";
import { formatPaiseAsInr } from "@/lib/services/amlMoney";
import type { AmlTransaction, AmlTransactionPage } from "@/types/aml";
import type { FetchStatus } from "@/lib/store/amlStore";
import { cn } from "@/lib/utils";

export interface AmlTransactionTableProps {
  status: FetchStatus;
  page: AmlTransactionPage | null;
  error: string | null;
  selectedTransactionId: string | null;
  onSelectTransaction: (id: string) => void;
  onSelectAccount: (id: string) => void;
  onCursorChange: (cursor: number) => void;
  cursor: number;
  limit: number;
  className?: string;
}

export function AmlTransactionTable({
  status,
  page,
  error,
  selectedTransactionId,
  onSelectTransaction,
  onSelectAccount,
  onCursorChange,
  cursor,
  limit,
  className,
}: AmlTransactionTableProps) {
  if (status === "loading" && !page) {
    return <LoadingState label="Loading transactions…" className={className} />;
  }
  if (status === "error") {
    return <EmptyState title="Could not load transactions" description={error ?? undefined} className={className} />;
  }
  if (!page || page.items.length === 0) {
    return <EmptyState title="No transactions in this view" className={className} />;
  }

  const start = cursor + 1;
  const end = cursor + page.items.length;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <caption className="sr-only">IBM synthetic AML benchmark transactions, paginated.</caption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Receiver</TableHead>
              <TableHead>Format</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((tx: AmlTransaction) => (
              <TableRow
                key={tx.id}
                tabIndex={0}
                role="button"
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
                      onSelectAccount(tx.sender);
                    }}
                    className="font-data hover:underline"
                  >
                    {tx.sender}
                  </button>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAccount(tx.receiver);
                    }}
                    className="font-data hover:underline"
                  >
                    {tx.receiver}
                  </button>
                </TableCell>
                <TableCell className="font-data text-muted-foreground">{tx.paymentFormat}</TableCell>
                <TableCell className="text-right font-data">{formatPaiseAsInr(tx.amountPaise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
        <span>
          {start.toLocaleString("en-IN")}–{end.toLocaleString("en-IN")} of {page.totalMatching.toLocaleString("en-IN")}
        </span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" disabled={cursor === 0} onClick={() => onCursorChange(Math.max(0, cursor - limit))}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page.nextCursor === null}
            onClick={() => page.nextCursor !== null && onCursorChange(page.nextCursor)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
