import { Flag, Snowflake } from "lucide-react";
import type { SimulatedActionState } from "@/types/investigation";
import { cn } from "@/lib/utils";

/**
 * Flag/Freeze are demo-only simulated actions (see
 * components/investigation/InvestigationActions.tsx) -- these badges are
 * deliberately worded "(simulated)" everywhere they appear so nobody reads
 * them as a real bank action having occurred.
 */
export function SimulatedActionBadges({ state, className }: { state: SimulatedActionState | undefined; className?: string }) {
  if (!state || (!state.flagged && !state.frozen)) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {state.flagged && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md border border-risk-medium/30 bg-risk-medium/15 px-1.5 text-[0.7rem] font-medium text-risk-medium">
          <Flag className="size-3" aria-hidden="true" />
          Flagged (simulated)
        </span>
      )}
      {state.frozen && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md border border-status-info/30 bg-status-info/15 px-1.5 text-[0.7rem] font-medium text-status-info">
          <Snowflake className="size-3" aria-hidden="true" />
          Frozen (simulated)
        </span>
      )}
    </span>
  );
}
