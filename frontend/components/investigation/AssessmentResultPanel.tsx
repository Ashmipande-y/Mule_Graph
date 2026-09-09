import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { formatFullUtc, formatScore } from "@/lib/format";
import type { AssessmentResult } from "@/types/assessment";
import { labelFor } from "@/lib/services/labels";
import { cn } from "@/lib/utils";

export interface AssessmentResultPanelProps {
  result: AssessmentResult;
  isStale?: boolean;
  isPrevious?: boolean;
  onSelectAccount?: (id: string) => void;
  className?: string;
}

/**
 * "Risk assessment" is the fixed section label -- never "model prediction"
 * or a named model -- unless the service itself reports a scoring method
 * that says otherwise; that string is shown verbatim, never invented.
 */
export function AssessmentResultPanel({
  result,
  isStale = false,
  isPrevious = false,
  onSelectAccount,
  className,
}: AssessmentResultPanelProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-md border border-border bg-panel-2 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {result.status === "completed" ? (
            <CheckCircle2 className="size-3.5 text-status-live" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3.5 text-risk-medium" aria-hidden="true" />
          )}
          <span className="text-xs font-semibold tracking-wide text-foreground uppercase">
            Risk assessment: {result.status}
          </span>
          {isPrevious && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
              Previous result
            </span>
          )}
          {isStale && !isPrevious && (
            <span className="rounded border border-risk-medium/30 bg-risk-medium/10 px-1.5 py-0.5 text-[0.65rem] text-risk-medium">
              Out of date — inputs changed since this ran
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 font-data text-[0.65rem] text-muted-foreground">
          <Clock className="size-3" aria-hidden="true" />
          {formatFullUtc(result.assessedAt)}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Accounts assessed</dt>
          <dd className="font-data font-semibold text-foreground">{result.accounts.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Requiring review</dt>
          <dd className="font-data font-semibold text-foreground">{result.accountsRequiringReview.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Scoring method</dt>
          <dd className="font-data font-semibold text-foreground">{result.scoringMethod ?? "Not reported"}</dd>
        </div>
      </dl>
      <p className="-mt-1.5 text-[0.65rem] text-muted-foreground">
        Scoring method and evidence are shown exactly as returned by the assessment service — not assumed to be a
        calibrated probability unless reported as one.
      </p>

      <div>
        <h4 className="mb-1.5 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
          Detected network patterns ({result.patterns.length})
        </h4>
        {result.patterns.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pattern reported by the assessment service.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {result.patterns.map((pattern, index) => (
              <li key={index} className="rounded border border-border p-2 text-xs">
                <p className="font-medium text-foreground">{pattern.pattern}</p>
                {(pattern.sourceAccount || pattern.collectorAccount) && (
                  <p className="mt-0.5 font-data text-muted-foreground">
                    {pattern.sourceAccount}
                    {pattern.intermediaryAccounts.length > 0 && ` -> ${pattern.intermediaryAccounts.join(", ")} ->`}
                    {pattern.collectorAccount ? ` ${pattern.collectorAccount}` : ""}
                  </p>
                )}
                {pattern.score !== undefined && (
                  <p className="mt-0.5 text-muted-foreground">
                    Score: {pattern.score.toFixed(4)}
                    {pattern.scoreMethod ? ` (${pattern.scoreMethod})` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-1.5 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
          Per-account risk ({result.accounts.length})
        </h4>
        <ul className="flex flex-col gap-1">
          {result.accounts.map((account) => (
            <li key={account.accountId}>
              <button
                type="button"
                onClick={() => onSelectAccount?.(account.accountId)}
                className="flex w-full items-center justify-between rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                <span className="font-data text-foreground">
                  {labelFor(account.accountId)} ({account.accountId})
                  {account.requiresReview && <span className="ml-1.5 text-risk-medium">review</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-data text-muted-foreground">{formatScore(account.riskScore)}</span>
                  <RiskBadge level={account.riskLevel} showIcon={false} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
