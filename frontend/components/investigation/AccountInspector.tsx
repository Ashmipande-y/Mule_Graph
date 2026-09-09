"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { SimulatedActionBadges } from "@/components/shared/SimulatedActionBadges";
import { StatusPill } from "@/components/shared/StatusPill";
import { EmptyState } from "@/components/shared/States";
import { InvestigationActions } from "./InvestigationActions";
import { ExplanationPanel } from "./ExplanationPanel";
import { NotesPanel } from "./NotesPanel";
import { useAccountDetail } from "@/hooks/useAccountDetail";
import { useConsoleData } from "@/hooks/useConsoleData";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { formatClockUtc, formatINR, formatScore } from "@/lib/format";
import { labelFor } from "@/lib/services/labels";
import { cn } from "@/lib/utils";

export function AccountInspector({ accountId, className }: { accountId: string | null; className?: string }) {
  const detail = useAccountDetail(accountId);
  const status = useConsoleStore((s) => (accountId ? (s.investigationStatus[accountId] ?? "NEW") : "NEW"));
  const actionState = useConsoleStore((s) => (accountId ? s.simulatedActions[accountId] : undefined));
  const { assessmentActive, assessmentResult } = useConsoleData();
  const assessmentAccount = assessmentResult?.accounts.find((a) => a.accountId === accountId) ?? null;

  if (!accountId) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <EmptyState
          title="No account selected"
          description="Select an account from the graph, the accessible list, a table row, or an alert to inspect it."
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <EmptyState
          title={accountId}
          description="This account has no revealed activity yet. Play or advance the replay to see its transfers."
        />
      </div>
    );
  }

  const history = [...detail.sent, ...detail.received].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="flex flex-col gap-3 p-3">
        <header className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-data text-sm font-semibold text-foreground">{detail.node.id}</p>
              <p className="text-xs text-muted-foreground">{detail.node.label}</p>
            </div>
            <RiskBadge level={detail.node.riskLevel} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={status} />
            <SimulatedActionBadges state={actionState} />
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border bg-panel-3 p-2.5 text-xs">
          <div>
            <p className="text-muted-foreground">Evidence score</p>
            <p className="font-data text-sm font-semibold text-foreground">{formatScore(detail.node.riskScore)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Findings</p>
            <p className="font-data text-sm font-semibold text-foreground">
              {assessmentActive ? (assessmentAccount?.findingCount ?? 0) : detail.findings.length}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Received</p>
            <p className="font-data text-sm font-semibold text-foreground">{formatINR(detail.receivedTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Sent</p>
            <p className="font-data text-sm font-semibold text-foreground">{formatINR(detail.sentTotal)}</p>
          </div>
        </section>
        {detail.node.riskScore !== null && (
          <p className="-mt-1.5 text-[0.65rem] text-muted-foreground">
            Evidence-strength heuristic score, not a calibrated fraud probability.
          </p>
        )}

        {assessmentActive && assessmentAccount && (
          <section className="rounded-md border border-status-info/30 bg-status-info/10 p-2.5 text-xs">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-status-info uppercase">
              Assessment evidence
            </h3>
            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-muted-foreground">Roles</dt>
                <dd className="font-data text-foreground">
                  {assessmentAccount.roles.length > 0 ? assessmentAccount.roles.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requires review</dt>
                <dd className="font-data text-foreground">{assessmentAccount.requiresReview ? "Yes" : "No"}</dd>
              </div>
            </dl>
            {assessmentAccount.evidenceTransactionIds.length > 0 && (
              <div className="mt-2">
                <p className="text-muted-foreground">Evidence transactions</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {assessmentAccount.evidenceTransactionIds.map((id) => (
                    <span key={id} className="rounded border border-border px-1.5 py-0.5 font-data text-[0.65rem]">
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        {assessmentActive && !assessmentAccount && (
          <p className="text-[0.65rem] text-muted-foreground">
            Not covered by the latest assessment response — absence of evidence, not confirmation of safety.
          </p>
        )}

        <InvestigationActions accountId={accountId} />

        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Connections ({detail.connections.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {detail.connections.map((connection) => (
              <li
                key={`${connection.direction}-${connection.accountId}`}
                className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
              >
                <span className="flex items-center gap-1.5 font-data">
                  {connection.direction === "in" ? (
                    <ArrowDownLeft className="size-3 text-status-live" aria-label="Incoming" />
                  ) : (
                    <ArrowUpRight className="size-3 text-risk-medium" aria-label="Outgoing" />
                  )}
                  {labelFor(connection.accountId)} ({connection.accountId})
                </span>
                <span className="font-data text-muted-foreground">
                  {formatINR(connection.total)} · {connection.count}x
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Transaction history ({history.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {history.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 font-data text-xs"
              >
                <span className="flex items-center gap-1">
                  {tx.sender === accountId ? (
                    <ArrowUpRight className="size-3 shrink-0 text-risk-medium" aria-label="Sent" />
                  ) : (
                    <ArrowDownLeft className="size-3 shrink-0 text-status-live" aria-label="Received" />
                  )}
                  {tx.id}
                </span>
                <span className="text-muted-foreground">{formatClockUtc(tx.timestamp)}</span>
                <span className="text-foreground">{formatINR(tx.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        {!assessmentActive && <ExplanationPanel detail={detail} />}
        <NotesPanel accountId={accountId} />
      </div>
    </ScrollArea>
  );
}
