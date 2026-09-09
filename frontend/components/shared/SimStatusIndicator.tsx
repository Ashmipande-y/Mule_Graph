"use client";

import { useConsoleStore } from "@/lib/store/consoleStore";
import { cn } from "@/lib/utils";

export function SimStatusIndicator({ className }: { className?: string }) {
  const playing = useConsoleStore((s) => s.playing);
  const revealedCount = useConsoleStore((s) => s.revealedCount);
  const total = useConsoleStore((s) => s.transactions.length);
  const dataMode = useConsoleStore((s) => s.dataMode);
  const liveStatus = useConsoleStore((s) => s.liveStatus);

  let label: string;
  let live = false;
  if (dataMode === "live") {
    label = liveStatus === "ready" ? "LIVE API" : liveStatus === "error" ? "LIVE API ERROR" : "CONNECTING";
    live = liveStatus === "ready";
  } else if (playing) {
    label = "REPLAYING";
    live = true;
  } else if (revealedCount >= total) {
    label = "COMPLETE";
  } else if (revealedCount === 0) {
    label = "STANDBY";
  } else {
    label = "PAUSED";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-data text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-status-live" : "bg-muted-foreground")} aria-hidden="true" />
      {label}
    </span>
  );
}
