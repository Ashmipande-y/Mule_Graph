import { PlugZap } from "lucide-react";
import { ASSESSMENT_ENDPOINT_PATH } from "@/lib/services/assessmentClient";
import { cn } from "@/lib/utils";

/**
 * The honest terminal state when the assessment backend doesn't exist yet
 * (currently always, since POST /api/assess isn't implemented) -- never a
 * silent fallback to a fabricated result. Documents the exact contract a
 * future backend would need so this is genuinely useful, not just an error.
 */
export function AssessmentServiceNotConnected({ message, className }: { message: string; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-md border border-risk-high/30 bg-risk-high/10 p-3", className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-risk-high">
        <PlugZap className="size-3.5" aria-hidden="true" />
        Assessment service not connected
      </p>
      <p className="mt-1.5 font-data text-[0.7rem] text-muted-foreground">{message}</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Expected backend contract
        </summary>
        <div className="mt-1.5 space-y-1.5 font-data text-[0.65rem] text-muted-foreground">
          <p>
            <span className="text-foreground">POST</span> {ASSESSMENT_ENDPOINT_PATH}
          </p>
          <pre className="overflow-auto rounded border border-border bg-panel-3 p-2 whitespace-pre-wrap">
{`{ "transactions": [
  { "id", "sender", "receiver", "amount", "timestamp" }, ...
] }`}
          </pre>
          <p className="text-foreground">Response:</p>
          <pre className="overflow-auto rounded border border-border bg-panel-3 p-2 whitespace-pre-wrap">
{`{
  "status": "completed",
  "assessed_at": "...",
  "model_mode": "rules",
  "accounts": [{ "account_id", "risk_score", "risk_level", ... }],
  "patterns": [{ "pattern", "source_account", "collector_account",
                 "intermediary_accounts", "score", "evidence" }]
}`}
          </pre>
          <p>See frontend/docs/assessment-endpoint-contract.md for the full contract.</p>
        </div>
      </details>
    </div>
  );
}
