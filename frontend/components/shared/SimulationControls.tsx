"use client";

import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConsoleStore, useConsoleActions, SPEED_OPTIONS, type SpeedMultiplier } from "@/lib/store/consoleStore";
import { useAssessmentStore } from "@/lib/store/assessmentStore";
import { AddTransactionButton } from "@/components/transactions/AddTransactionButton";
import { cn } from "@/lib/utils";

export function SimulationControls({ className, compact = false }: { className?: string; compact?: boolean }) {
  const playing = useConsoleStore((s) => s.playing);
  const speed = useConsoleStore((s) => s.speed);
  const revealedCount = useConsoleStore((s) => s.revealedCount);
  const total = useConsoleStore((s) => s.transactions.length);
  const dataMode = useConsoleStore((s) => s.dataMode);
  const workspaceOpen = useAssessmentStore((s) => s.isOpen);
  const hasAssessmentResult = useAssessmentStore((s) => s.result !== null);
  // Replay must not run while an analyst is preparing/running an
  // assessment, or once one is active, so the submitted/displayed dataset
  // can't shift unexpectedly underneath them.
  const isReplayable = dataMode === "simulation" && !workspaceOpen && !hasAssessmentResult;
  const actions = useConsoleActions();

  const atStart = revealedCount === 0;
  const atEnd = revealedCount >= total;

  return (
    <div className={cn("flex items-center gap-1.5", className)} role="group" aria-label="Replay controls">
      <Button
        variant="outline"
        size={compact ? "icon-sm" : "icon"}
        aria-label="Reset replay to start"
        disabled={!isReplayable || atStart}
        onClick={() => actions.reset()}
      >
        <RotateCcw />
      </Button>
      <Button
        variant="outline"
        size={compact ? "icon-sm" : "icon"}
        aria-label="Step back one transaction"
        disabled={!isReplayable || atStart}
        onClick={() => actions.stepBackward()}
      >
        <SkipBack />
      </Button>
      <Button
        variant={playing ? "secondary" : "default"}
        size={compact ? "sm" : "default"}
        aria-label={playing ? "Pause replay" : "Play replay"}
        disabled={!isReplayable}
        onClick={() => (playing ? actions.pause() : actions.play())}
        className="min-w-20"
      >
        {playing ? <Pause /> : <Play />}
        {playing ? "Pause" : atEnd ? "Replay" : "Play"}
      </Button>
      <Button
        variant="outline"
        size={compact ? "icon-sm" : "icon"}
        aria-label="Step forward one transaction"
        disabled={!isReplayable || atEnd}
        onClick={() => actions.stepForward()}
      >
        <SkipForward />
      </Button>
      <Select
        value={String(speed)}
        onValueChange={(value) => actions.setSpeed(Number(value) as SpeedMultiplier)}
        disabled={!isReplayable}
      >
        <SelectTrigger size="sm" aria-label="Replay speed" className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPEED_OPTIONS.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="font-data text-xs text-muted-foreground" aria-live="polite">
        {revealedCount}/{total}
      </span>
      <AddTransactionButton compact={compact} />
    </div>
  );
}
