"use client";

import { useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { cn } from "@/lib/utils";

/**
 * The one place the backend's base URL is configured -- shared by "Live
 * API" graph mode (DataModeToggle) and the XGBoost score tool, so both
 * connect to the same running FastAPI instance without duplicating a URL
 * field.
 */
export function BackendUrlEditor({ className }: { className?: string }) {
  const liveBaseUrl = useConsoleStore((s) => s.liveBaseUrl);
  const liveStatus = useConsoleStore((s) => s.liveStatus);
  const liveError = useConsoleStore((s) => s.liveError);
  const actions = useConsoleActions();
  const [draft, setDraft] = useState(liveBaseUrl);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setDraft(liveBaseUrl);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Backend connection settings" className={cn(className)}>
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="backend-base-url" className="text-xs text-muted-foreground">
            Backend base URL
          </Label>
          <Input
            id="backend-base-url"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="font-data text-xs"
            spellCheck={false}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              onClick={() => {
                actions.setLiveBaseUrl(draft);
                void actions.fetchLive();
              }}
            >
              <RefreshCw className="size-3" />
              Save &amp; test
            </Button>
            {liveStatus === "ready" && <span className="text-xs font-medium text-status-live">Connected</span>}
            {liveStatus === "error" && <span className="text-xs font-medium text-risk-high">Failed</span>}
            {liveStatus === "loading" && <span className="text-xs text-muted-foreground">Testing…</span>}
          </div>
          {liveStatus === "error" && liveError && (
            <p className="font-data text-[0.65rem] text-muted-foreground">{liveError}</p>
          )}
          <p className="text-[0.65rem] text-muted-foreground">
            Used for both &ldquo;Live API&rdquo; graph mode and the XGBoost score tool.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
