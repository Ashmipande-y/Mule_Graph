"use client";

import { useState } from "react";
import { Download, Network, Share2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { KpiStrip } from "./KpiStrip";
import { AlertQueueTable } from "./AlertQueueTable";
import { CopilotPanel } from "./CopilotPanel";
import { OverviewTab } from "./tabs/OverviewTab";
import { EvidenceTab } from "./tabs/EvidenceTab";
import { MoneyFlowTab } from "./tabs/MoneyFlowTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { ReportsTab } from "./tabs/ReportsTab";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";
import { cn } from "@/lib/utils";
import type { SavedCase } from "@/lib/services/caseClient";

export function WorkspaceView({
  scenario,
  caseOpen,
  onOpenCase,
  className,
  savedCase,
}: {
  scenario: InvestigatorScenario;
  caseOpen: boolean;
  onOpenCase: () => void;
  className?: string;
  savedCase?: SavedCase;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const { finding, flaggedAccountId, flaggedAccountLabel, accountRisk } = scenario;
  const flaggedRisk = flaggedAccountId ? accountRisk.get(flaggedAccountId) : undefined;

  if (!caseOpen || !finding || !flaggedAccountId) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-auto", className)}>
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold text-foreground">Alert queue</h2>
        </div>
        <AlertQueueTable scenario={scenario} onOpenCase={onOpenCase} />
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-data text-sm font-semibold text-foreground">{flaggedAccountId}</span>
            <span className="rounded border border-risk-high/30 bg-risk-high/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-risk-high">
              Flagged for investigator review
            </span>
            {flaggedRisk && <RiskBadge level={flaggedRisk.riskLevel} />}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setActiveTab("network")}>
              <Share2 className="size-3.5" />
              Trace funds
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActiveTab("network")}>
              <Network className="size-3.5" />
              Connected accounts
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActiveTab("reports")}>
              <Download className="size-3.5" />
              Export case file
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {flaggedAccountLabel} · KYC entity: <span className="italic">not available in this dataset</span> · Policy mode:{" "}
          <span className="font-medium text-foreground">rules-based (ml/rules)</span>
        </p>
        <KpiStrip scenario={scenario} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 gap-0 overflow-hidden border-r border-border">
          <TabsList variant="line" className="mx-3 mt-2 shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="money-flow">Money flow</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto">
            <OverviewTab scenario={scenario} />
          </TabsContent>
          <TabsContent value="evidence" className="min-h-0 flex-1 overflow-auto">
            <EvidenceTab scenario={scenario} />
          </TabsContent>
          <TabsContent value="money-flow" className="min-h-0 flex-1 overflow-auto">
            <MoneyFlowTab scenario={scenario} />
          </TabsContent>
          <TabsContent value="network" className="min-h-0 flex-1 overflow-hidden">
            <NetworkTab scenario={scenario} />
          </TabsContent>
          <TabsContent value="reports" className="min-h-0 flex-1 overflow-auto">
            <ReportsTab scenario={scenario} savedCase={savedCase} />
          </TabsContent>
        </Tabs>

        <CopilotPanel scenario={scenario} className="min-h-0" />
      </div>
    </div>
  );
}
