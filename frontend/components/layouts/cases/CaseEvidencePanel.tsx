"use client";

import { RiskBadge } from "@/components/shared/RiskBadge";
import { riskLevelForScore } from "@/lib/services/rules/accountRisk";
import { labelFor } from "@/lib/services/labels";
import type { CaseSummary } from "@/types/case";
import { cn } from "@/lib/utils";

function AccountRow({
  accountId,
  role,
  onSelectAccount,
}: {
  accountId: string;
  role: string;
  onSelectAccount: (id: string) => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
      <button type="button" onClick={() => onSelectAccount(accountId)} className="font-data hover:underline">
        {labelFor(accountId)} ({accountId})
      </button>
      <span className="text-muted-foreground">{role}</span>
    </li>
  );
}

export function CaseEvidencePanel({
  caseSummary,
  onSelectAccount,
  className,
}: {
  caseSummary: CaseSummary;
  onSelectAccount: (id: string) => void;
  className?: string;
}) {
  const finding = caseSummary.primaryFinding;
  const level = riskLevelForScore(finding.score);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <section className="rounded-md border border-border bg-panel-3 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Evidence</h3>
          <RiskBadge level={level} />
        </div>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Evidence score</dt>
            <dd className="font-data font-semibold text-foreground">{finding.score.toFixed(4)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pattern</dt>
            <dd className="font-data text-foreground">{finding.pattern}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Intermediary ratio</dt>
            <dd className="font-data text-foreground">{Math.round(finding.evidence.intermediaryRatio * 100)}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Amount conservation</dt>
            <dd className="font-data text-foreground">{Math.round(finding.evidence.amountConservation * 100)}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Time compactness</dt>
            <dd className="font-data text-foreground">{Math.round(finding.evidence.timeCompactness * 100)}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Window span</dt>
            <dd className="font-data text-foreground">{Math.round(finding.evidence.windowSpanSeconds)}s</dd>
          </div>
        </dl>
        <p className="mt-2 text-[0.65rem] text-muted-foreground">
          Heuristic evidence-strength score, not a calibrated fraud probability.
        </p>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Accounts in this network ({caseSummary.accountIds.length})
        </h3>
        <ul className="flex flex-col gap-1">
          <AccountRow accountId={finding.sourceAccount} role="source" onSelectAccount={onSelectAccount} />
          {finding.intermediaryAccounts.map((id) => (
            <AccountRow key={id} accountId={id} role="intermediary" onSelectAccount={onSelectAccount} />
          ))}
          <AccountRow accountId={finding.collectorAccount} role="collector" onSelectAccount={onSelectAccount} />
        </ul>
      </section>
    </div>
  );
}
