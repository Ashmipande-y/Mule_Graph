import { riskColor } from "@/lib/riskColors";
import type { RiskLevel } from "@/types/risk";
import { cn } from "@/lib/utils";

const LEVELS: RiskLevel[] = ["HIGH", "MEDIUM", "LOW", "UNASSESSED"];

export function GraphLegend({
  variant = "dark",
  edgeHighlightLabel,
  className,
}: {
  variant?: "dark" | "light";
  /** When set, adds a line explaining what the graph's highlighted edges
   * mean (e.g. "Ground-truth labeled transaction") -- only render this
   * when GraphCanvas is actually passed a non-empty highlightEdgeIds. */
  edgeHighlightLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <p className="mb-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Risk legend</p>
      <ul className="flex flex-col gap-1">
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-[0.7rem] text-foreground">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: riskColor(level, variant) }}
              aria-hidden="true"
            />
            {level}
          </li>
        ))}
      </ul>
      {edgeHighlightLabel && (
        <div className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-foreground">
          <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: riskColor("HIGH", variant) }} aria-hidden="true" />
          {edgeHighlightLabel}
        </div>
      )}
    </div>
  );
}
