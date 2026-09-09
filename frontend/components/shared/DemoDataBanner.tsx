import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Persistent, always-visible marker that the data is synthetic and the risk
 * shown is a heuristic -- deliberately not left only to a tooltip (see
 * docs/milestone-1.md's gate: "not implied only by risk_level in a
 * tooltip").
 */
export function DemoDataBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-b border-border bg-panel-3 px-3 py-1 text-[0.7rem] text-muted-foreground",
        className,
      )}
    >
      <FlaskConical className="size-3 shrink-0" aria-hidden="true" />
      <span>
        Synthetic demo data · Risk is a rules-based evidence heuristic, not a calibrated fraud probability · No real
        accounts are affected by any action here
      </span>
    </div>
  );
}
