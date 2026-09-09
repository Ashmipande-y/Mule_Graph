"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AnalystProfile } from "@/components/shared/AnalystProfile";
import { DemoDataBanner } from "@/components/shared/DemoDataBanner";
import { MetricsStrip } from "@/components/shared/MetricsStrip";
import { VolumeTrendChart } from "@/components/shared/VolumeTrendChart";
import { SimulationControls } from "@/components/shared/SimulationControls";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphAccessibleList } from "@/components/graph/GraphAccessibleList";
import { AlertList } from "@/components/alerts/AlertList";
import { TransactionEventStream } from "@/components/transactions/TransactionEventStream";
import { AccountInspector } from "@/components/investigation/AccountInspector";
import { LoadingState, ErrorState } from "@/components/shared/States";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useConsoleData } from "@/hooks/useConsoleData";

/**
 * The app's single home view: the currently active dataset's graph, alerts,
 * key metrics, and replay/live-mode controls, all sourced from
 * useConsoleData()/consoleStore -- the same real data pipeline every
 * previous experimental layout read from. Replaces the five parallel
 * layout variants (command/terminal/graph/cases/enterprise) that existed
 * during earlier visual-design exploration; this is the one that ships.
 */
export function OverviewView() {
  const data = useConsoleData();
  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const selectedTransactionId = useConsoleStore((s) => s.selectedTransactionId);
  const actions = useConsoleActions();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <h1 className="text-sm font-semibold text-foreground">Overview</h1>
        <div className="flex items-center gap-2">
          <DataModeToggle className="hidden lg:flex" />
          <AnalystProfile />
        </div>
      </header>

      <DemoDataBanner />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
        <MetricsStrip
          metrics={data.metrics}
          revealedCount={data.revealedCount}
          totalTransactions={data.totalTransactions}
          className="flex-1"
        />
        <VolumeTrendChart className="hidden h-14 w-40 shrink-0 xl:block" />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <SimulationControls />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-[3]">
            {data.isLive && data.liveStatus === "loading" && <LoadingState label="Fetching live graph…" />}
            {data.isLive && data.liveStatus === "error" && (
              <ErrorState title="Could not load the live graph" description={data.liveError ?? undefined} />
            )}
            {data.graph && !(data.isLive && data.liveStatus !== "ready") && (
              <GraphCanvas
                graph={data.graph}
                selectedAccountId={selectedAccountId}
                onSelectAccount={(id) => actions.selectAccount(id)}
                className="absolute inset-0"
              />
            )}
          </div>
          <details className="shrink-0 border-t border-border">
            <summary className="cursor-pointer px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              Accessible account list (same data as the graph)
            </summary>
            {data.graph && (
              <GraphAccessibleList
                graph={data.graph}
                selectedAccountId={selectedAccountId}
                onSelectAccount={(id) => actions.selectAccount(id)}
                className="max-h-40"
              />
            )}
          </details>

          <Tabs defaultValue="stream" className="min-h-0 flex-[2] shrink-0 gap-0 overflow-hidden border-t border-border">
            <TabsList variant="line" className="mx-4 mt-1.5">
              <TabsTrigger value="stream">Event stream</TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1.5">
                Alerts
                {data.alerts.length > 0 && (
                  <Badge variant="destructive" className="h-4 px-1 text-[0.65rem]">
                    {data.alerts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="stream" className="min-h-0 flex-1 overflow-auto">
              <TransactionEventStream
                transactions={data.revealedTransactions}
                onSelectTransaction={(id) => actions.selectTransaction(id)}
                selectedTransactionId={selectedTransactionId}
              />
            </TabsContent>
            <TabsContent value="alerts" className="min-h-0 flex-1 overflow-auto p-4 pt-0">
              <AlertList
                alerts={data.alerts}
                selectedAccountId={selectedAccountId}
                onSelectAccount={(id) => actions.selectAccount(id)}
              />
            </TabsContent>
          </Tabs>
        </div>

        <AccountInspector accountId={selectedAccountId} className="w-80 shrink-0 border-l border-border" />
      </div>
    </div>
  );
}
