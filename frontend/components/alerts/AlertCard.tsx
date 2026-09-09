"use client";

import { ChevronRight } from "lucide-react";
import { RiskBadge } from "@/components/shared/RiskBadge";
import type { Alert } from "@/types/alert";
import { cn } from "@/lib/utils";

export function AlertCard({
  alert,
  onSelectAccount,
  selected,
  className,
}: {
  alert: Alert;
  onSelectAccount: (id: string) => void;
  selected?: boolean;
  className?: string;
}) {
  const accountIds = [alert.finding.sourceAccount, ...alert.finding.intermediaryAccounts, alert.finding.collectorAccount];

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-panel-2 p-2.5",
        selected && "border-primary/60 ring-1 ring-primary/30",
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <RiskBadge level={alert.level} />
        {alert.revealedAtStep !== null && (
          <span className="font-data text-[0.65rem] text-muted-foreground">revealed at step {alert.revealedAtStep}</span>
        )}
      </div>
      <p className="text-xs font-medium text-foreground">{alert.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{alert.summary}</p>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">
        Evidence score {alert.finding.score.toFixed(4)} — heuristic ranking, not a fraud probability.
      </p>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Accounts in this alert">
        {accountIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectAccount(id)}
            className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-data text-[0.65rem] hover:bg-accent hover:text-accent-foreground"
          >
            {id}
            <ChevronRight className="size-2.5" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
