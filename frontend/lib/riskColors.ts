import type { RiskVisualLevel } from "@/types/risk";

/**
 * Concrete color values mirroring the CSS custom properties in
 * app/globals.css. Canvas rendering (react-force-graph-2d draws on a raw
 * <canvas>) can't consume CSS variables, so these are kept as the single
 * duplicated source -- update both together if the palette changes.
 */
export const RISK_COLORS_DARK: Record<RiskVisualLevel, string> = {
  HIGH: "#e5484d",
  MEDIUM: "#f5a623",
  LOW: "#6b8cae",
  UNASSESSED: "#5b6270",
  CRITICAL: "#ff4d5e",
  NORMAL: "#3d4450",
};

export const RISK_COLORS_LIGHT: Record<RiskVisualLevel, string> = {
  HIGH: "#c22b3a",
  MEDIUM: "#b3690a",
  LOW: "#4a6fa5",
  UNASSESSED: "#8a93a0",
  CRITICAL: "#a3162a",
  NORMAL: "#8a93a0",
};

export function riskColor(level: RiskVisualLevel, variant: "dark" | "light" = "dark"): string {
  return (variant === "dark" ? RISK_COLORS_DARK : RISK_COLORS_LIGHT)[level];
}

/** Tailwind utility classes for badges/chips, using the same semantic tokens. */
export function riskBadgeClasses(level: RiskVisualLevel): string {
  switch (level) {
    case "HIGH":
    case "CRITICAL":
      return "bg-risk-high/15 text-risk-high border-risk-high/30";
    case "MEDIUM":
      return "bg-risk-medium/15 text-risk-medium border-risk-medium/30";
    case "LOW":
      return "bg-risk-low/15 text-risk-low border-risk-low/30";
    case "NORMAL":
    case "UNASSESSED":
    default:
      return "bg-risk-unassessed/15 text-risk-unassessed border-risk-unassessed/30";
  }
}

export function riskLabel(level: RiskVisualLevel): string {
  return level;
}
