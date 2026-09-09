import { ShieldAlert } from "lucide-react";
import type { AmlRulesFinding } from "@/types/aml";
import { cn } from "@/lib/utils";

/**
 * Explicitly labeled as rules-engine output (ml/rules, dataset-scale
 * config) -- never the aml_baseline XGBoost classifier's output. See
 * backend/docs/aml-integration-contract.md.
 */
export function AmlRulesFindingsPanel({ findings, className }: { findings: AmlRulesFinding[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <ShieldAlert className="size-3.5" aria-hidden="true" />
        Rules findings for this neighborhood ({findings.length})
      </h3>
      <p className="text-[0.65rem] text-muted-foreground">
        From ml/rules at a dataset-scale (hours) window — not the aml_baseline model&apos;s output, and not run over the
        full 27,511-row dataset, only the currently-shown neighborhood.
      </p>
      {findings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No fan-out/convergence pattern found in this neighborhood.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {findings.map((finding, index) => (
            <li key={index} className="rounded border border-border p-2 text-xs">
              <p className="font-medium text-foreground">{finding.pattern}</p>
              <p className="mt-0.5 font-data text-muted-foreground">
                {finding.sourceAccount} -&gt; {finding.intermediaryAccounts.join(", ")} -&gt; {finding.collectorAccount}
              </p>
              <p className="mt-0.5 text-muted-foreground">Evidence score: {finding.score.toFixed(4)} (heuristic, not a probability)</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
