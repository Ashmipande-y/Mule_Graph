"use client";

import { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/shared/Brand";
import { SimStatusIndicator } from "@/components/shared/SimStatusIndicator";
import { AnalystProfile } from "@/components/shared/AnalystProfile";
import { DemoDataBanner } from "@/components/shared/DemoDataBanner";
import { MetricsStrip } from "@/components/shared/MetricsStrip";
import { SimulationControls } from "@/components/shared/SimulationControls";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
import { LayoutSwitcher } from "@/components/layouts/LayoutSwitcher";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { AlertList } from "@/components/alerts/AlertList";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { AccountInspector } from "@/components/investigation/AccountInspector";
import { LoadingState, ErrorState, NoResultsState } from "@/components/shared/States";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useConsoleData } from "@/hooks/useConsoleData";
import { useLightTheme } from "@/hooks/useLightTheme";
import { nodeMatchesRiskFilter, transactionMatchesQuery } from "@/lib/services/search";

const NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "network", label: "Network" },
  { id: "alerts", label: "Alerts" },
  { id: "monitoring", label: "Monitoring" },
];

export function EnterpriseBankingView() {
  const data = useConsoleData();
  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const selectedTransactionId = useConsoleStore((s) => s.selectedTransactionId);
  const searchQuery = useConsoleStore((s) => s.searchQuery);
  const riskFilter = useConsoleStore((s) => s.riskFilter);
  const actions = useConsoleActions();

  useEffect(() => {
    actions.setActiveLayout("enterprise");
  }, [actions]);
  // Applied to <html>, not a local wrapper -- see useLightTheme's docstring:
  // Radix Dialog/Sheet content (including the globally-mounted
  // AssessmentWorkspaceSheet) portals to document.body, which a scoped
  // wrapper class would never reach.
  useLightTheme();

  const nodesById = useMemo(() => new Map((data.graph?.nodes ?? []).map((n) => [n.id, n])), [data.graph]);

  const filteredTransactions = useMemo(() => {
    return data.revealedTransactions.filter((tx) => {
      if (!transactionMatchesQuery(tx, searchQuery)) return false;
      if (riskFilter.length === 0) return true;
      const senderNode = nodesById.get(tx.sender);
      const receiverNode = nodesById.get(tx.receiver);
      return (
        (senderNode && nodeMatchesRiskFilter(senderNode, riskFilter)) ||
        (receiverNode && nodeMatchesRiskFilter(receiverNode, riskFilter))
      );
    });
  }, [data.revealedTransactions, searchQuery, riskFilter, nodesById]);

  return (
    <div className="theme-light flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-4">
        <div className="flex items-center gap-6">
          <Brand />
          <nav aria-label="Sections" className="hidden items-center gap-4 md:flex">
            {NAV_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <SimStatusIndicator className="hidden lg:flex" />
          <DataModeToggle className="hidden lg:flex" />
          <LayoutSwitcher />
          <AnalystProfile />
        </div>
      </header>

      <DemoDataBanner />

      <div id="overview" className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-sm font-semibold text-foreground">Fraud network overview</h1>
          <SimulationControls />
        </div>
        <MetricsStrip metrics={data.metrics} revealedCount={data.revealedCount} totalTransactions={data.totalTransactions} />
      </div>

      <div className="flex min-h-0 flex-[3]">
        <div id="network" className="relative min-h-0 min-w-0 flex-[2] border-r border-border">
          {data.isLive && data.liveStatus === "loading" && <LoadingState label="Fetching live graph…" />}
          {data.isLive && data.liveStatus === "error" && (
            <ErrorState title="Could not load the live graph" description={data.liveError ?? undefined} />
          )}
          {data.graph && !(data.isLive && data.liveStatus !== "ready") && (
            <GraphCanvas
              graph={data.graph}
              selectedAccountId={selectedAccountId}
              onSelectAccount={actions.selectAccount}
              variant="light"
              className="absolute inset-0"
            />
          )}
          <div className="absolute bottom-3 left-3 rounded-md border border-border bg-panel/95 p-2 shadow-sm">
            <GraphLegend variant="light" />
          </div>
        </div>

        <aside id="alerts" className="flex w-80 shrink-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Priority alerts</h2>
            {data.alerts.length > 0 && <Badge variant="destructive">{data.alerts.length}</Badge>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <AlertList alerts={data.alerts} selectedAccountId={selectedAccountId} onSelectAccount={actions.selectAccount} />
          </div>
        </aside>
      </div>

      <div id="monitoring" className="flex min-h-0 flex-[2] flex-col border-t border-border">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Transaction monitoring ({filteredTransactions.length})
          </h2>
          <SearchFilterBar className="max-w-md" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {filteredTransactions.length === 0 && searchQuery ? (
            <NoResultsState query={searchQuery} />
          ) : (
            <TransactionTable
              transactions={filteredTransactions}
              nodesById={nodesById}
              selectedTransactionId={selectedTransactionId}
              onSelectTransaction={actions.selectTransaction}
              onSelectAccount={actions.selectAccount}
            />
          )}
        </div>
      </div>

      <Dialog
        open={selectedAccountId !== null}
        onOpenChange={(open) => {
          if (!open) actions.selectAccount(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border p-4 pb-3">
            <DialogTitle>Account inspector</DialogTitle>
            <DialogDescription>Evidence, connections, and actions for the selected account.</DialogDescription>
          </DialogHeader>
          <AccountInspector accountId={selectedAccountId} className="min-h-0 flex-1" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
