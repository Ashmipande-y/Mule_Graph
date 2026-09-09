"use client";

import { Cloud, HardDrive, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { BackendUrlEditor } from "./BackendUrlEditor";
import { cn } from "@/lib/utils";

/**
 * Switches between the bundled replayable demo dataset and a one-shot fetch
 * of the real backend's `/api/graph`. Never falls back to mock data on a
 * live-fetch failure -- the error state is shown as-is (see
 * lib/services/apiClient.ts).
 */
export function DataModeToggle({ className }: { className?: string }) {
  const dataMode = useConsoleStore((s) => s.dataMode);
  const liveStatus = useConsoleStore((s) => s.liveStatus);
  const actions = useConsoleActions();

  return (
    <div className={cn("flex items-center rounded-md border border-border bg-panel-3 p-0.5 text-xs", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={dataMode === "simulation"}
            onClick={() => actions.setDataMode("simulation")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors",
              dataMode === "simulation" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HardDrive className="size-3" aria-hidden="true" />
            Simulation
          </button>
        </TooltipTrigger>
        <TooltipContent>Bundled demo dataset, replayable step by step.</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={dataMode === "live"}
            onClick={() => actions.setDataMode("live")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors",
              dataMode === "live" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {dataMode === "live" && liveStatus === "loading" ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <Cloud className="size-3" aria-hidden="true" />
            )}
            Live API
          </button>
        </TooltipTrigger>
        <TooltipContent>Fetch the real FastAPI backend&apos;s /api/graph as a static snapshot (not replayable).</TooltipContent>
      </Tooltip>
      <BackendUrlEditor />
    </div>
  );
}
