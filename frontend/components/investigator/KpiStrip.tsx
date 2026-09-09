import { formatINR } from "@/lib/format";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";
import { cn } from "@/lib/utils";

function KpiCard({ label, value, hint, unavailable }: { label: string; value: string; hint?: string; unavailable?: boolean }) {
  return (
    <div className="flex-1 rounded-md border border-border bg-panel-2 px-3 py-2">
      <p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-0.5 font-data text-base font-semibold", unavailable ? "text-muted-foreground italic" : "text-foreground")}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Six metrics, matched 1:1 against what this dataset can actually support.
 * The two this canonical demo has no basis for at all (device/IP telemetry,
 * cross-border destination data) show an explicit "not available" state --
 * never a plausible-looking invented number.
 */
export function KpiStrip({ scenario, className }: { scenario: InvestigatorScenario; className?: string }) {
  const { finding, flaggedAccountId, accountRisk, connectedAccountCount, victimIds, strict } = scenario;
  const flaggedRisk = flaggedAccountId ? accountRisk.get(flaggedAccountId) : undefined;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <KpiCard
        label="Risk band"
        value={flaggedRisk ? flaggedRisk.riskLevel : "UNASSESSED"}
        hint={finding ? `Score ${finding.score.toFixed(4)}` : undefined}
      />
      <KpiCard label="Linked exposure" value={formatINR(strict.exposure)} hint="Strict policy" />
      <KpiCard label="Connected accounts" value={String(connectedAccountCount)} hint="Entities in this network" />
      <KpiCard label="Potential victims" value={String(victimIds.length)} hint="Verified senders with no prior inbound" />
      <KpiCard label="Shared devices / IPs" value="Not available" hint="No device/IP telemetry in this dataset" unavailable />
      <KpiCard label="External destinations" value="Not available" hint="No cross-border corridor data in this dataset" unavailable />
    </div>
  );
}
