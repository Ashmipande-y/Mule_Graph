import type { NetworkMetrics } from "@/lib/services/metrics";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Deliberately not the same tile-grid MetricsStrip used in Command Center --
 * a single dense monospace line of label:value pairs, closer to a
 * Bloomberg-style ticker than a dashboard card row.
 */
export function TerminalMetricsBar({
  metrics,
  revealedCount,
  totalTransactions,
  className,
}: {
  metrics: NetworkMetrics | null;
  revealedCount: number;
  totalTransactions: number;
  className?: string;
}) {
  if (!metrics) return null;
  const fields: [string, string, boolean?][] = [
    ["ACCTS", String(metrics.accountsObserved)],
    ["TXN", `${revealedCount}/${totalTransactions}`],
    ["VOL", formatINR(metrics.totalTransactionVolume)],
    ["ENTRY", formatINR(metrics.uniqueFundsEntering)],
    ["ALERTS", String(metrics.activeAlerts), metrics.activeAlerts > 0],
    ["HIGH", String(metrics.highRiskAccounts), metrics.highRiskAccounts > 0],
    ["MED", String(metrics.mediumRiskAccounts)],
    ["UNASSESSED", String(metrics.unassessedAccounts)],
  ];

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 font-data text-xs", className)}>
      {fields.map(([label, value, danger]) => (
        <span key={label} className="flex items-baseline gap-1">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn("font-semibold text-foreground", danger && "text-risk-high")}>{value}</span>
        </span>
      ))}
    </div>
  );
}
