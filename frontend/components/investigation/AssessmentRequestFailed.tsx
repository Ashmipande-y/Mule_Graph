import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssessmentErrorKind } from "@/lib/services/assessmentClient";

/**
 * Shown when the assessment backend is connected but rejected or failed
 * this specific request (a validation error, a duplicate transaction id, or
 * a server error) -- distinct from AssessmentServiceNotConnected, which is
 * only for a genuinely unreachable/unimplemented backend. Conflating the
 * two would misreport a working service as disconnected.
 */
export function AssessmentRequestFailed({
  message,
  kind,
  className,
}: {
  message: string;
  kind: Exclude<AssessmentErrorKind, "not-connected" | "network"> | null;
  className?: string;
}) {
  const title = kind === "validation" ? "Assessment rejected" : "Assessment request failed";
  return (
    <div role="alert" className={cn("rounded-md border border-risk-high/30 bg-risk-high/10 p-3", className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-risk-high">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1.5 font-data text-[0.7rem] text-muted-foreground">{message}</p>
    </div>
  );
}
