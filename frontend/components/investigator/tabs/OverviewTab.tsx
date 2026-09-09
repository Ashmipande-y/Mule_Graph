import { formatFullUtc } from "@/lib/format";
import { labelFor } from "@/lib/services/labels";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";

export function OverviewTab({ scenario }: { scenario: InvestigatorScenario }) {
  const { finding, flaggedAccountId, flaggedAccountLabel, sourceAccountId, intermediaryIds, victimIds } = scenario;
  if (!finding || !flaggedAccountId) {
    return <p className="p-3 text-sm text-muted-foreground">No case detected in the current dataset.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Executive summary</h3>
        <p className="text-sm text-foreground">
          {labelFor(sourceAccountId!)} ({sourceAccountId}) fanned funds out to {intermediaryIds.length} intermediary accounts
          ({intermediaryIds.join(", ")}), which converged onto {flaggedAccountLabel} ({flaggedAccountId}) within{" "}
          {Math.round(finding.evidence.windowSpanSeconds)} seconds — a pattern `ml/rules` classifies as{" "}
          <span className="font-medium">fan_out_convergence</span>. This is the same real detector output the canonical
          demo&apos;s graph and alert panels show, presented here in a case-file layout.
        </p>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Timeline</h3>
        <ul className="flex flex-col gap-1 text-xs">
          <li className="flex justify-between gap-2 rounded border border-border px-2 py-1">
            <span className="text-muted-foreground">Funds enter the network ({victimIds.map(labelFor).join(", ") || "—"})</span>
            <span className="font-data text-foreground">{formatFullUtc(finding.windowStart)}</span>
          </li>
          <li className="flex justify-between gap-2 rounded border border-border px-2 py-1">
            <span className="text-muted-foreground">Fan-out begins from {labelFor(sourceAccountId!)}</span>
            <span className="font-data text-foreground">{formatFullUtc(finding.windowStart)}</span>
          </li>
          <li className="flex justify-between gap-2 rounded border border-border px-2 py-1">
            <span className="text-muted-foreground">Convergence completes at {flaggedAccountLabel}</span>
            <span className="font-data text-foreground">{formatFullUtc(finding.windowEnd)}</span>
          </li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Rule triggers hit</h3>
        <div className="rounded border border-border p-2.5 text-xs">
          <p className="font-medium text-foreground">fan_out_convergence</p>
          <p className="mt-1 text-muted-foreground">{finding.scoreMethod}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 font-data">
            <div>
              <dt className="text-muted-foreground">Intermediary ratio</dt>
              <dd className="text-foreground">{finding.evidence.intermediaryRatio}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Amount conservation</dt>
              <dd className="text-foreground">{finding.evidence.amountConservation}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Time compactness</dt>
              <dd className="text-foreground">{finding.evidence.timeCompactness}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
