"use client";

import { Slider } from "@/components/ui/slider";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { formatClockUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Scrubbing this consistently updates the graph, alerts, metrics, and
 * evidence in every layout because they all read from the same
 * `revealedCount` in the console store via `useConsoleData`.
 */
export function TimelineScrubber({ className }: { className?: string }) {
  const transactions = useConsoleStore((s) => s.transactions);
  const revealedCount = useConsoleStore((s) => s.revealedCount);
  const isReplayable = useConsoleStore((s) => s.dataMode === "simulation");
  const actions = useConsoleActions();

  const currentTx = revealedCount > 0 ? transactions[revealedCount - 1] : null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
        <span>Scenario start</span>
        <span className="font-data text-foreground">
          {currentTx ? `${formatClockUtc(currentTx.timestamp)} UTC · ${currentTx.id} revealed` : "Not started"}
        </span>
        <span>Fully revealed</span>
      </div>
      <Slider
        value={[revealedCount]}
        min={0}
        max={transactions.length}
        step={1}
        disabled={!isReplayable}
        onValueChange={([value]) => actions.seek(value)}
        aria-label="Replay timeline: transactions revealed so far"
      />
      <div className="flex gap-px" aria-hidden="true">
        {transactions.map((tx, index) => (
          <button
            key={tx.id}
            type="button"
            tabIndex={-1}
            disabled={!isReplayable}
            onClick={() => actions.seek(index + 1)}
            title={`${tx.id} · ${formatClockUtc(tx.timestamp)} UTC`}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index < revealedCount ? "bg-primary" : "bg-border",
              isReplayable && "cursor-pointer",
            )}
          />
        ))}
      </div>
    </div>
  );
}
