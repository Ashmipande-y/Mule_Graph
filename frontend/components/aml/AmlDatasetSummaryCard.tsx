import { Database, FlaskConical } from "lucide-react";
import type { AmlDatasetSummary } from "@/types/aml";
import { formatFullUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AmlDatasetSummaryCard({ summary, className }: { summary: AmlDatasetSummary; className?: string }) {
  return (
    <div className={cn("rounded-md border border-border bg-panel-2 p-3", className)}>
      <div className="mb-2 flex items-center gap-1.5">
        <FlaskConical className="size-3.5 text-risk-medium" aria-hidden="true" />
        <span className="text-xs font-semibold text-risk-medium">{summary.label} — synthetic, not real UPI data</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-muted-foreground">Period</dt>
          <dd className="font-data text-foreground">
            {summary.periodStart ? formatFullUtc(summary.periodStart).slice(0, 10) : "—"} to{" "}
            {summary.periodEnd ? formatFullUtc(summary.periodEnd).slice(0, 10) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Transactions</dt>
          <dd className="font-data font-semibold text-foreground">{summary.totalTransactions.toLocaleString("en-IN")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Accounts</dt>
          <dd className="font-data font-semibold text-foreground">{summary.totalAccounts.toLocaleString("en-IN")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Session-added</dt>
          <dd className="font-data font-semibold text-foreground">{summary.sessionTransactionCount}</dd>
        </div>
        <div className="col-span-2">
          <dt className="flex items-center gap-1 text-muted-foreground">
            <Database className="size-3" aria-hidden="true" /> Scoring
          </dt>
          <dd className="font-data text-foreground">
            {summary.modelAvailable ? "aml_baseline model available" : "aml_baseline model not connected"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[0.65rem] text-muted-foreground">
        {summary.source} · Amounts in {summary.amountUnit} · {summary.timestampTimezoneNote}
      </p>
    </div>
  );
}
