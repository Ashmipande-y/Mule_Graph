"use client";

import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/shared/Brand";
import { SimStatusIndicator } from "@/components/shared/SimStatusIndicator";
import { AnalystProfile } from "@/components/shared/AnalystProfile";
import { DemoDataBanner } from "@/components/shared/DemoDataBanner";
import { MetricsStrip } from "@/components/shared/MetricsStrip";
import { VolumeTrendChart } from "@/components/shared/VolumeTrendChart";
import { SimulationControls } from "@/components/shared/SimulationControls";
import { LayoutSwitcher } from "@/components/layouts/LayoutSwitcher";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import { CommandSideNav } from "./CommandSideNav";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphAccessibleList } from "@/components/graph/GraphAccessibleList";
import { AlertList } from "@/components/alerts/AlertList";
import { TransactionEventStream } from "@/components/transactions/TransactionEventStream";
import { AccountInspector } from "@/components/investigation/AccountInspector";
import { LoadingState, ErrorState } from "@/components/shared/States";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useConsoleData } from "@/hooks/useConsoleData";

export function CommandCenterView() {
  const data = useConsoleData();
  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const selectedTransactionId = useConsoleStore((s) => s.selectedTransactionId);
  const actions = useConsoleActions();

  useEffect(() => {
    actions.setActiveLayout("command");
  }, [actions]);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-3">
        <div className="flex min-w-0 items-center gap-3">
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

      <div className="flex min-h-0 flex-1">
        <CommandSideNav />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
            <MetricsStrip
              metrics={data.metrics}
              revealedCount={data.revealedCount}
              totalTransactions={data.totalTransactions}
              className="flex-1"
            />
            <VolumeTrendChart className="hidden h-14 w-40 shrink-0 xl:block" />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
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
                <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
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
                <TabsList variant="line" className="mx-3 mt-1.5">
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
                <TabsContent value="alerts" className="min-h-0 flex-1 overflow-auto p-3 pt-0">
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
      </div>
    </div>
  );
}
