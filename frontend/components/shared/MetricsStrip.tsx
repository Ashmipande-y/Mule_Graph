import type { NetworkMetrics } from "@/lib/services/metrics";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: "high" | "live";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md border border-border bg-panel-2 px-3 py-2", className)}>
      <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span
        className={cn(
          "font-data text-base leading-tight font-semibold text-foreground",
          accent === "high" && "text-risk-high",
          accent === "live" && "text-status-live",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function MetricsStrip({
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
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", className)}>
      <Tile label="Accounts observed" value={String(metrics.accountsObserved)} />
      <Tile label="Transactions" value={`${revealedCount}/${totalTransactions}`} />
      <Tile label="Total volume" value={formatINR(metrics.totalTransactionVolume)} />
      <Tile label="Unique funds entering" value={formatINR(metrics.uniqueFundsEntering)} />
      <Tile label="Active alerts" value={String(metrics.activeAlerts)} accent={metrics.activeAlerts > 0 ? "high" : undefined} />
      <Tile
        label="High risk accounts"
        value={String(metrics.highRiskAccounts)}
        accent={metrics.highRiskAccounts > 0 ? "high" : undefined}
      />
    </div>
  );
}
