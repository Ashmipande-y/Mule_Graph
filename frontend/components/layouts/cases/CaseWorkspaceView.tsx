"use client";

import { useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brand } from "@/components/shared/Brand";
import { SimStatusIndicator } from "@/components/shared/SimStatusIndicator";
import { AnalystProfile } from "@/components/shared/AnalystProfile";
import { DemoDataBanner } from "@/components/shared/DemoDataBanner";
import { SimulationControls } from "@/components/shared/SimulationControls";
import { LayoutSwitcher } from "@/components/layouts/LayoutSwitcher";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/States";
import { AccountInspector } from "@/components/investigation/AccountInspector";
import { CaseList } from "./CaseList";
import { CaseEvidencePanel } from "./CaseEvidencePanel";
import { CaseTimelineList } from "./CaseTimelineList";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useConsoleData } from "@/hooks/useConsoleData";
import { buildCaseTimeline } from "@/lib/services/caseTimeline";

export function CaseWorkspaceView() {
  const data = useConsoleData();
  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const activeCaseId = useConsoleStore((s) => s.activeCaseId);
  const activityLog = useConsoleStore((s) => s.activityLog);
  const actions = useConsoleActions();

  useEffect(() => {
    actions.setActiveLayout("cases");
  }, [actions]);

  // Auto-select the sole derived case once it exists, without overriding an
  // analyst's explicit choice once more than one case can exist.
  useEffect(() => {
    if (!activeCaseId && data.cases.length > 0) {
      actions.setActiveCase(data.cases[0].id);
    }
  }, [activeCaseId, data.cases, actions]);

  const activeCase = data.cases.find((c) => c.id === activeCaseId) ?? data.cases[0] ?? null;

  const highlightIds = useMemo(() => (activeCase ? new Set(activeCase.accountIds) : undefined), [activeCase]);

  const timeline = useMemo(
    () => (activeCase ? buildCaseTimeline(activeCase, data.revealedTransactions, activityLog) : []),
    [activeCase, data.revealedTransactions, activityLog],
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-3">
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

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <SimulationControls />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-3 py-1.5">
            <h2 className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Suspicious networks ({data.cases.length})
            </h2>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <CaseList
              cases={data.cases}
              activeCaseId={activeCase?.id ?? null}
              onSelectCase={actions.setActiveCase}
              emptyDescription={
                data.assessmentActive
                  ? "An assessment is active. Its detected patterns are shown in the Assessment workspace panel, not listed here as a case."
                  : undefined
              }
            />
          </ScrollArea>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border">
          <div className="relative min-h-0 flex-1">
            {data.isLive && data.liveStatus === "loading" && <LoadingState label="Fetching live graph…" />}
            {data.isLive && data.liveStatus === "error" && (
              <ErrorState title="Could not load the live graph" description={data.liveError ?? undefined} />
            )}
            {data.graph && !(data.isLive && data.liveStatus !== "ready") && (
              <GraphCanvas
                graph={data.graph}
                selectedAccountId={selectedAccountId}
                onSelectAccount={actions.selectAccount}
                highlightAccountIds={highlightIds}
                className="absolute inset-0"
              />
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t border-border">
            <div className="border-b border-border px-3 py-1.5">
              <h2 className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                Investigation timeline
              </h2>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <CaseTimelineList events={timeline} />
            </ScrollArea>
          </div>
        </div>

        <div className="flex w-96 shrink-0 flex-col">
          {!activeCase ? (
            <EmptyState
              title="No active case"
              description="Advance the replay until a network's evidence is fully revealed."
              className="h-full"
            />
          ) : (
            <Tabs defaultValue="evidence" className="min-h-0 flex-1 gap-0">
              <TabsList variant="line" className="mx-3 mt-2">
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="account">Account</TabsTrigger>
              </TabsList>
              <TabsContent value="evidence" className="min-h-0 flex-1 overflow-auto">
                <CaseEvidencePanel caseSummary={activeCase} onSelectAccount={actions.selectAccount} className="p-3" />
              </TabsContent>
              <TabsContent value="account" className="min-h-0 flex-1 overflow-hidden">
                {selectedAccountId ? (
                  <AccountInspector accountId={selectedAccountId} className="h-full" />
                ) : (
                  <EmptyState
                    title="No account selected"
                    description="Select an account from the Evidence tab or the graph to inspect it here."
                    className="h-full"
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
