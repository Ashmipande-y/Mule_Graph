import { riskColor } from "@/lib/riskColors";
import type { RiskLevel } from "@/types/risk";
import { cn } from "@/lib/utils";

const LEVELS: RiskLevel[] = ["HIGH", "MEDIUM", "LOW", "UNASSESSED"];

export function GraphLegend({ variant = "dark", className }: { variant?: "dark" | "light"; className?: string }) {
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
    </div>
  );
}
