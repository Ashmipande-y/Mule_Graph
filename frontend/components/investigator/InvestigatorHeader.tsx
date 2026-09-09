"use client";

import { Bot } from "lucide-react";
import { AnalystProfile } from "@/components/shared/AnalystProfile";
import { cn } from "@/lib/utils";

export type InvestigatorView = "home" | "workspace";

/**
 * Every status shown here is either real (which dataset is active) or an
 * explicit, honestly-labeled simulation state -- never a real third-party
 * product name for something that isn't actually connected (no "Genie", no
 * "Unity Catalog" -- there is no LLM or data-catalog integration in this
 * stack; see components/investigator/CopilotPanel.tsx).
 */
export function InvestigatorHeader({
  view,
  onViewChange,
  className,
}: {
  view: InvestigatorView;
  onViewChange: (view: InvestigatorView) => void;
  className?: string;
}) {
  return (
    <header className={cn("flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-3", className)}>
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-foreground">Investigator</h1>
        <div
          className="flex items-center rounded-md border border-border bg-panel-3 p-0.5 text-xs"
          role="group"
          aria-label="Investigator view"
        >
          <button
            type="button"
            aria-pressed={view === "home"}
            onClick={() => onViewChange("home")}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              view === "home" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Home
          </button>
          <button
            type="button"
            aria-pressed={view === "workspace"}
            onClick={() => onViewChange("workspace")}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              view === "workspace" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Investigation Workspace
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.65rem] text-muted-foreground md:flex">
          <span className="font-data">Evidence and saved cases</span>
        </span>
        <span className="hidden items-center gap-1.5 rounded-md border border-status-info/30 bg-status-info/10 px-2 py-1 text-[0.65rem] text-status-info lg:flex">
          <Bot className="size-3" aria-hidden="true" />
          AI Copilot: Simulated — not connected
        </span>
        <AnalystProfile />
      </div>
    </header>
  );
}
