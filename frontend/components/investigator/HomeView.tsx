"use client";

import { ArrowRight, MessageCircleQuestion, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { formatINR } from "@/lib/format";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";
import { cn } from "@/lib/utils";

const PROCESS_STEPS = [
  { title: "Select signal", description: "Select a finding from the current dataset or reopen a saved case." },
  { title: "Investigate with AI Copilot", description: "Ask a templated question grounded in this case's real evidence — no live model is connected." },
  { title: "Follow the money", description: "Trace the transfer graph and compare strict vs. permissive evidence policies." },
  { title: "Assess & export", description: "Review the account roles and download the underlying evidence as JSON." },
];

export function HomeView({
  scenario,
  onOpenCase,
  className,
}: {
  scenario: InvestigatorScenario;
  onOpenCase: () => void;
  className?: string;
}) {
  const { finding, flaggedAccountId, flaggedAccountLabel, accountRisk } = scenario;
  const flaggedRisk = flaggedAccountId ? accountRisk.get(flaggedAccountId) : undefined;

  return (
    <div className={cn("flex flex-col gap-4 overflow-auto p-4", className)}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-3 rounded-md border border-risk-high/30 bg-risk-high/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.65rem] font-semibold tracking-wide text-risk-high uppercase">Highest-priority alert · real detection</span>
            {flaggedRisk && <RiskBadge level={flaggedRisk.riskLevel} />}
          </div>
          {finding && flaggedAccountId ? (
            <>
              <div>
                <p className="font-data text-lg font-semibold text-foreground">{flaggedAccountLabel} ({flaggedAccountId})</p>
                <p className="text-xs text-muted-foreground">
                  Evidence score {finding.score.toFixed(4)} — {flaggedRisk?.riskLevel ?? "UNASSESSED"}. Heuristic ranking, not a
                  calibrated fraud probability.
                </p>
              </div>
              <p className="text-sm text-foreground">
                Pattern detected: <span className="font-medium">fan_out_convergence</span> — {finding.intermediaryAccounts.length}{" "}
                accounts converged funds onto this collector within {Math.round(finding.evidence.windowSpanSeconds)}s.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={onOpenCase}>
                  Open case <ArrowRight className="size-3.5" />
                </Button>
                <Button variant="outline" onClick={onOpenCase}>
                  <Sparkles className="size-3.5" />
                  Ask AI Copilot
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No case detected in the current dataset.</p>
          )}
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-md border border-border bg-panel-2 p-4">
          <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
            <MessageCircleQuestion className="size-3.5" aria-hidden="true" />
            Investigator&apos;s question
          </p>
          <p className="text-sm text-foreground italic">
            &quot;Why did {finding?.intermediaryAccounts.length ?? 0} distinct accounts funnel funds within{" "}
            {finding ? Math.round(finding.evidence.windowSpanSeconds) : 0} seconds into a single collector node?&quot;
          </p>
          {finding && (
            <p className="text-xs text-muted-foreground">
              Linked exposure under the strict evidence policy: {formatINR(scenario.strict.exposure)}.
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Network className="size-3.5" aria-hidden="true" />
          Investigation workflow
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-md border border-border bg-panel-2 p-3">
              <p className="font-data text-[0.65rem] text-muted-foreground">Step {index + 1}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{step.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
