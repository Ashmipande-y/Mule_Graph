"use client";

import { RiskBadge } from "@/components/shared/RiskBadge";
import { EmptyState } from "@/components/shared/States";
import { riskLevelForScore } from "@/lib/services/rules/accountRisk";
import type { CaseSummary } from "@/types/case";
import { cn } from "@/lib/utils";

export function CaseList({
  cases,
  activeCaseId,
  onSelectCase,
  emptyDescription = "A case is created once a detected pattern's evidence is fully revealed by replay. Start or advance the simulation.",
  className,
}: {
  cases: CaseSummary[];
  activeCaseId: string | null;
  onSelectCase: (id: string) => void;
  emptyDescription?: string;
  className?: string;
}) {
  if (cases.length === 0) {
    return <EmptyState title="No case yet" description={emptyDescription} className={className} />;
  }

  return (
    <ul className={cn("flex flex-col gap-2 p-2", className)} aria-label="Suspicious networks">
      {cases.map((caseSummary) => {
        const level = riskLevelForScore(caseSummary.primaryFinding.score);
        const active = caseSummary.id === activeCaseId;
        return (
          <li key={caseSummary.id}>
            <button
              type="button"
              onClick={() => onSelectCase(caseSummary.id)}
              aria-pressed={active}
              className={cn(
                "w-full rounded-md border border-border bg-panel-2 p-2.5 text-left transition-colors hover:border-primary/40",
                active && "border-primary/60 ring-1 ring-primary/30",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-data text-xs font-semibold text-foreground">{caseSummary.id}</span>
                <RiskBadge level={level} />
              </div>
              <p className="text-xs text-foreground">{caseSummary.title}</p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                {caseSummary.accountIds.length} accounts · evidence score {caseSummary.primaryFinding.score.toFixed(4)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
