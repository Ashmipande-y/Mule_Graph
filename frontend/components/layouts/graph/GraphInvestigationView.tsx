"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Brand } from "@/components/shared/Brand";
import { SimStatusIndicator } from "@/components/shared/SimStatusIndicator";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
import { SimulationControls } from "@/components/shared/SimulationControls";
import { TimelineScrubber } from "@/components/shared/TimelineScrubber";
import { LoadingState, ErrorState } from "@/components/shared/States";
import { LayoutSwitcher } from "@/components/layouts/LayoutSwitcher";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { GraphAccessibleList } from "@/components/graph/GraphAccessibleList";
import { AccountInspector } from "@/components/investigation/AccountInspector";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useConsoleData } from "@/hooks/useConsoleData";
import { accountMatchesQuery, nodeMatchesRiskFilter } from "@/lib/services/search";
import { formatFullUtc } from "@/lib/format";

export function GraphInvestigationView() {
  const data = useConsoleData();
  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const searchQuery = useConsoleStore((s) => s.searchQuery);
  const riskFilter = useConsoleStore((s) => s.riskFilter);
  const actions = useConsoleActions();
  const [showAccessibleList, setShowAccessibleList] = useState(false);

  useEffect(() => {
    actions.setActiveLayout("graph");
  }, [actions]);

  const highlightIds = useMemo(() => {
    if (!data.graph) return undefined;
    if (!searchQuery.trim() && riskFilter.length === 0) return undefined;
    const set = new Set<string>();
    for (const node of data.graph.nodes) {
      if (accountMatchesQuery(node, searchQuery) && nodeMatchesRiskFilter(node, riskFilter)) set.add(node.id);
    }
    return set;
  }, [data.graph, searchQuery, riskFilter]);

  const currentTx = data.revealedCount > 0 ? data.revealedTransactions[data.revealedCount - 1] : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <header className="absolute inset-x-0 top-0 z-20 flex h-10 items-center justify-between border-b border-border/70 bg-panel/90 px-3 backdrop-blur-sm">
        <Brand />
        <div className="flex items-center gap-2">
          <DataModeToggle />
          <LayoutSwitcher />
        </div>
      </header>

      <div className="absolute inset-0 top-10 bottom-24">
        {data.isLive && data.liveStatus === "loading" && <LoadingState label="Fetching live graph…" className="h-full" />}
        {data.isLive && data.liveStatus === "error" && (
          <ErrorState title="Could not load the live graph" description={data.liveError ?? undefined} className="h-full" />
        )}
        {data.graph && !(data.isLive && data.liveStatus !== "ready") && (
          <GraphCanvas
            graph={data.graph}
            selectedAccountId={selectedAccountId}
            onSelectAccount={(id) => actions.selectAccount(id)}
            highlightAccountIds={highlightIds}
            className="absolute inset-0"
          />
        )}
      </div>

      <div className="absolute top-14 left-3 z-10 w-64 rounded-md border border-border bg-panel/95 p-2 shadow-sm backdrop-blur-sm">
        <SearchFilterBar />
      </div>

      <div className="absolute top-14 right-3 z-10 rounded-md border border-border bg-panel/95 px-2.5 py-1.5 text-right shadow-sm backdrop-blur-sm">
        <SimStatusIndicator className="justify-end" />
        <p className="mt-0.5 font-data text-[0.65rem] text-muted-foreground">
          {currentTx ? formatFullUtc(currentTx.timestamp) : "Replay not started"}
        </p>
      </div>

      <div className="absolute bottom-28 left-3 z-10 rounded-md border border-border bg-panel/95 p-2.5 shadow-sm backdrop-blur-sm">
        <GraphLegend />
        <button
          type="button"
          onClick={() => setShowAccessibleList(true)}
          className="mt-2 text-[0.65rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          View accessible list
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-panel/95 px-4 py-2 backdrop-blur-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <SimulationControls compact />
          {data.metrics && (
            <span className="font-data text-[0.7rem] text-muted-foreground">
              {data.metrics.accountsObserved} accounts · {data.metrics.transactionsObserved} transfers ·{" "}
              {data.metrics.activeAlerts} active alert{data.metrics.activeAlerts === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <TimelineScrubber />
      </div>

      <Sheet
        open={selectedAccountId !== null}
        onOpenChange={(open) => {
          if (!open) actions.selectAccount(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Account inspector</SheetTitle>
            <SheetDescription>Evidence, connections, and actions for the selected account.</SheetDescription>
          </SheetHeader>
          <AccountInspector accountId={selectedAccountId} className="min-h-0 flex-1" />
        </SheetContent>
      </Sheet>

      <Dialog open={showAccessibleList} onOpenChange={setShowAccessibleList}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Accounts (accessible list)</DialogTitle>
            <DialogDescription>The same account and risk data shown in the graph, as a table.</DialogDescription>
          </DialogHeader>
          {data.graph && (
            <GraphAccessibleList
              graph={data.graph}
              selectedAccountId={selectedAccountId}
              onSelectAccount={(id) => {
                actions.selectAccount(id);
                setShowAccessibleList(false);
              }}
              className="max-h-96"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
