"use client";

import type { Ref } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { RiskBadge } from "./RiskBadge";
import type { RiskLevel } from "@/types/risk";
import { cn } from "@/lib/utils";

const LEVELS: RiskLevel[] = ["HIGH", "MEDIUM", "LOW", "UNASSESSED"];

export function SearchFilterBar({
  className,
  placeholder = "Search account or transaction ID…",
  inputRef,
}: {
  className?: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const query = useConsoleStore((s) => s.searchQuery);
  const riskFilter = useConsoleStore((s) => s.riskFilter);
  const actions = useConsoleActions();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-48 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => actions.setSearchQuery(event.target.value)}
          placeholder={placeholder}
          className="pr-7 pl-7"
          aria-label="Search accounts and transactions"
        />
        {query && (
          <button
            type="button"
            onClick={() => actions.setSearchQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Filter by risk level">
        {LEVELS.map((level) => {
          const active = riskFilter.includes(level);
          return (
            <button
              key={level}
              type="button"
              onClick={() => actions.toggleRiskFilter(level)}
              aria-pressed={active}
              className={cn("rounded-md transition-opacity", active ? "opacity-100" : "opacity-45 hover:opacity-75")}
            >
              <RiskBadge level={level} showIcon={false} />
            </button>
          );
        })}
        {riskFilter.length > 0 && (
          <button
            type="button"
            onClick={() => actions.clearRiskFilter()}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
