"use client";

import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/shared/Brand";
import { SimStatusIndicator } from "@/components/shared/SimStatusIndicator";
import { AnalystProfile } from "@/components/shared/AnalystProfile";
import { DemoDataBanner } from "@/components/shared/DemoDataBanner";
import { SimulationControls } from "@/components/shared/SimulationControls";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
import { LayoutSwitcher } from "@/components/layouts/LayoutSwitcher";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import { TerminalMetricsBar } from "./TerminalMetricsBar";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { AlertList } from "@/components/alerts/AlertList";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { TransactionDetailCard } from "@/components/transactions/TransactionDetailCard";
import { AccountInspector } from "@/components/investigation/AccountInspector";
import { NoResultsState } from "@/components/shared/States";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useConsoleData } from "@/hooks/useConsoleData";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { nodeMatchesRiskFilter, transactionMatchesQuery } from "@/lib/services/search";

export function TerminalView() {
  const data = useConsoleData();
  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const selectedTransactionId = useConsoleStore((s) => s.selectedTransactionId);
  const searchQuery = useConsoleStore((s) => s.searchQuery);
  const riskFilter = useConsoleStore((s) => s.riskFilter);
  const playing = useConsoleStore((s) => s.playing);
  const actions = useConsoleActions();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    actions.setActiveLayout("terminal");
  }, [actions]);

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

  const selectedTransaction = filteredTransactions.find((tx) => tx.id === selectedTransactionId) ?? null;

  useKeyboardShortcuts({
    "/": () => searchInputRef.current?.focus(),
    " ": () => (playing ? actions.pause() : actions.play()),
    r: () => actions.reset(),
    j: () => {
      const index = filteredTransactions.findIndex((tx) => tx.id === selectedTransactionId);
      const next = filteredTransactions[Math.min(filteredTransactions.length - 1, index + 1)];
      if (next) actions.selectTransaction(next.id);
    },
    k: () => {
      const index = filteredTransactions.findIndex((tx) => tx.id === selectedTransactionId);
      const prev = filteredTransactions[Math.max(0, index === -1 ? 0 : index - 1)];
      if (prev) actions.selectTransaction(prev.id);
    },
    escape: () => {
      actions.selectTransaction(null);
      actions.selectAccount(null);
    },
  });

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-3">
        <div className="flex items-center gap-3">
          <Brand />
          <SimStatusIndicator className="hidden md:flex" />
        </div>
        <div className="flex items-center gap-2">
          <DataModeToggle className="hidden lg:flex" />
          <LayoutSwitcher />
          <AnalystProfile />
        </div>
      </header>

      <DemoDataBanner />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <TerminalMetricsBar
          metrics={data.metrics}
          revealedCount={data.revealedCount}
          totalTransactions={data.totalTransactions}
        />
        <SimulationControls compact />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <SearchFilterBar inputRef={searchInputRef} className="flex-1" />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <h2 className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Alerts</h2>
            {data.alerts.length > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-[0.65rem]">
                {data.alerts.length}
              </Badge>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <AlertList alerts={data.alerts} selectedAccountId={selectedAccountId} onSelectAccount={actions.selectAccount} />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-[3] flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <h2 className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Transactions ({filteredTransactions.length})
            </h2>
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
                dense
              />
            )}
          </div>
        </div>

        <div className="hidden min-h-0 w-72 shrink-0 flex-col border-r border-border lg:flex">
          <div className="border-b border-border px-3 py-1.5">
            <h2 className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Network</h2>
          </div>
          <div className="relative min-h-0 flex-1">
            {data.graph && (
              <GraphCanvas
                graph={data.graph}
                selectedAccountId={selectedAccountId}
                onSelectAccount={actions.selectAccount}
                className="absolute inset-0"
                controls={false}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex h-56 shrink-0 border-t border-border">
        <TransactionDetailCard
          transaction={selectedTransaction}
          nodesById={nodesById}
          onSelectAccount={actions.selectAccount}
          className="w-72 shrink-0 border-r border-border"
        />
        <AccountInspector accountId={selectedAccountId} className="min-w-0 flex-1" />
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-panel px-3 py-1 font-data text-[0.65rem] text-muted-foreground">
        <span>
          <kbd className="rounded border border-border px-1">/</kbd> search
        </span>
        <span>
          <kbd className="rounded border border-border px-1">j</kbd>/<kbd className="rounded border border-border px-1">k</kbd> row
        </span>
        <span>
          <kbd className="rounded border border-border px-1">space</kbd> play/pause
        </span>
        <span>
          <kbd className="rounded border border-border px-1">r</kbd> reset
        </span>
        <span>
          <kbd className="rounded border border-border px-1">esc</kbd> clear selection
        </span>
      </footer>
    </div>
  );
}
