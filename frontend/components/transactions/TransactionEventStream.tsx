"use client";

import { ArrowRight } from "lucide-react";
import { formatClockUtc, formatINR } from "@/lib/format";
import type { Transaction } from "@/types/transaction";
import { EmptyState } from "@/components/shared/States";
import { cn } from "@/lib/utils";

/**
 * A live-feed presentation of the same revealed transactions the table
 * shows elsewhere, most recent first -- deliberately distinct from
 * TransactionTable's dense grid so Command Center reads as "an event
 * stream," not a duplicate table.
 */
export function TransactionEventStream({
  transactions,
  onSelectTransaction,
  selectedTransactionId,
  className,
}: {
  transactions: readonly Transaction[];
  onSelectTransaction: (id: string) => void;
  selectedTransactionId: string | null;
  className?: string;
}) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions revealed yet"
        description="Start the replay to see transfers arrive in real time."
        className={className}
      />
    );
  }

  const mostRecentFirst = [...transactions].reverse();

  return (
    <ul className={cn("flex flex-col divide-y divide-border overflow-auto", className)} aria-label="Transaction event stream">
      {mostRecentFirst.map((tx) => (
        <li key={tx.id}>
          <button
            type="button"
            onClick={() => onSelectTransaction(tx.id)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent",
              tx.id === selectedTransactionId && "bg-accent",
            )}
          >
            <span className="font-data text-muted-foreground">{formatClockUtc(tx.timestamp)}</span>
            <span className="font-data text-foreground">{tx.sender}</span>
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="font-data text-foreground">{tx.receiver}</span>
            <span className="ml-auto font-data font-medium text-foreground">{formatINR(tx.amount)}</span>
            <span className="font-data text-muted-foreground">{tx.id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
