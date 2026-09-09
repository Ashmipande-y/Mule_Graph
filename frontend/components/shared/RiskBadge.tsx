import { AlertTriangle, CircleHelp, ShieldAlert, TriangleAlert } from "lucide-react";
import type { RiskVisualLevel } from "@/types/risk";
import { riskBadgeClasses } from "@/lib/riskColors";
import { cn } from "@/lib/utils";

const ICONS: Record<RiskVisualLevel, typeof ShieldAlert> = {
  HIGH: ShieldAlert,
  CRITICAL: ShieldAlert,
  MEDIUM: TriangleAlert,
  LOW: AlertTriangle,
  NORMAL: CircleHelp,
  UNASSESSED: CircleHelp,
};

export function RiskBadge({
  level,
  className,
  showIcon = true,
}: {
  level: RiskVisualLevel;
  className?: string;
  showIcon?: boolean;
}) {
  const Icon = ICONS[level];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 font-data text-[0.7rem] font-semibold tracking-wide uppercase",
        riskBadgeClasses(level),
        className,
      )}
    >
      {showIcon && <Icon className="size-3" aria-hidden="true" />}
      {level}
    </span>
  );
}
