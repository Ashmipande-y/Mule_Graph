import type { InvestigationStatus } from "@/types/investigation";
import { cn } from "@/lib/utils";

const STYLES: Record<InvestigationStatus, string> = {
  NEW: "bg-muted text-muted-foreground border-border",
  INVESTIGATING: "bg-status-info/15 text-status-info border-status-info/30",
  ESCALATED: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  CLOSED: "bg-panel-3 text-muted-foreground border-border",
};

export function StatusPill({ status, className }: { status: InvestigationStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md border px-1.5 text-[0.7rem] font-medium tracking-wide uppercase",
        STYLES[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
