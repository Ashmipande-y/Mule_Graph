import { cn } from "@/lib/utils";

/**
 * A minimal outline glyph -- three nodes with directed edges converging on
 * one, evoking the fan-out/convergence pattern this app detects. Plain
 * `currentColor` line art only (no fills, no accent dot) so it reads
 * correctly in pure black-on-white or white-on-black.
 */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4.5" cy="6" r="2.1" />
      <circle cx="4.5" cy="18" r="2.1" />
      <circle cx="19.5" cy="12" r="2.4" />
      <path d="M6.5 7 L17.4 11" />
      <path d="M6.5 17 L17.4 13" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BrandMark className="text-foreground" />
      <span className="text-sm font-semibold tracking-tight text-foreground">MuleGraph</span>
    </div>
  );
}
