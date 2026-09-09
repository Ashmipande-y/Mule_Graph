import { ArrowRight } from "lucide-react";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { EmptyState } from "@/components/shared/States";
import { formatFullUtc, formatINR } from "@/lib/format";
import type { GraphNode } from "@/types/graph";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";

export function TransactionDetailCard({
  transaction,
  nodesById,
  onSelectAccount,
  className,
}: {
  transaction: Transaction | null;
  nodesById: ReadonlyMap<string, GraphNode>;
  onSelectAccount: (id: string) => void;
  className?: string;
}) {
  if (!transaction) {
    return (
      <EmptyState
        title="No transaction selected"
        description="Select a row from the table or event stream to inspect it."
        className={className}
      />
    );
  }

  const sender = nodesById.get(transaction.sender);
  const receiver = nodesById.get(transaction.receiver);

  return (
    <div className={cn("flex flex-col gap-2 p-3 text-xs", className)}>
      <div className="flex items-center justify-between">
        <p className="font-data text-sm font-semibold text-foreground">{transaction.id}</p>
        <p className="font-data text-base font-semibold text-foreground">{formatINR(transaction.amount)}</p>
      </div>
      <p className="font-data text-muted-foreground">{formatFullUtc(transaction.timestamp)}</p>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => onSelectAccount(transaction.sender)}
          className="flex items-center justify-between rounded border border-border px-2 py-1 hover:bg-accent"
        >
          <span className="font-data">
            {transaction.sender} <span className="text-muted-foreground">sender</span>
          </span>
          {sender && <RiskBadge level={sender.riskLevel} showIcon={false} />}
        </button>
        <div className="flex items-center justify-center text-muted-foreground">
          <ArrowRight className="size-3" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => onSelectAccount(transaction.receiver)}
          className="flex items-center justify-between rounded border border-border px-2 py-1 hover:bg-accent"
        >
          <span className="font-data">
            {transaction.receiver} <span className="text-muted-foreground">receiver</span>
          </span>
          {receiver && <RiskBadge level={receiver.riskLevel} showIcon={false} />}
        </button>
      </div>
    </div>
  );
}
