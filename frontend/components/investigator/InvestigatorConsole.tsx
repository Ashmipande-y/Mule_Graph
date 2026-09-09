"use client";
import { useMemo, useState } from "react";
import { DemoDataBanner } from "@/components/shared/DemoDataBanner";
import { InvestigatorHeader, type InvestigatorView } from "./InvestigatorHeader";
import { HomeView } from "./HomeView";
import { WorkspaceView } from "./WorkspaceView";
import { CaseDecisionPanel } from "./CaseDecisionPanel";
import { DataModeToggle } from "@/components/layouts/DataModeToggle";
import { Button } from "@/components/ui/button";
import { useConsoleData } from "@/hooks/useConsoleData";
import { useCaseStore } from "@/lib/store/caseStore";
import { mapApiFinding, mapApiGraph } from "@/lib/services/apiClient";
import { buildInvestigatorScenario } from "@/lib/services/investigatorScenario";

export function InvestigatorConsole() {
  const [view, setView] = useState<InvestigatorView>("home");
  const [findingKey, setFindingKey] = useState("");
  const { activeDataset, liveError } = useConsoleData();
  const cases = useCaseStore((s) => s.cases);
  const selectedId = useCaseStore((s) => s.selectedId);
  const select = useCaseStore((s) => s.select);
  const open = useCaseStore((s) => s.open);
  const error = useCaseStore((s) => s.error);
  const busy = useCaseStore((s) => s.busy);
  const record = cases.find((c) => c.case_id === selectedId);
  const scenario = useMemo(() => {
    if (record) {
      const finding = mapApiFinding(record.finding);
      return buildInvestigatorScenario(mapApiGraph(record.graph), record.transactions,
        (record.graph.findings ?? []).map(mapApiFinding), finding);
    }
    const findings = activeDataset.findings;
    const selected = findings.find((f) => JSON.stringify(f.fanOutTransactionIds) === findingKey);
    return buildInvestigatorScenario(activeDataset.graph ?? { nodes: [], edges: [] }, activeDataset.transactions, findings, selected);
  }, [record, activeDataset, findingKey]);

  async function openCase() {
    if (!scenario.finding || busy) return;
    if (record || await open(scenario.allTransactions, scenario.finding)) setView("workspace");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <InvestigatorHeader view={view} onViewChange={setView} />
      <DemoDataBanner />
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-3 text-xs">
        <DataModeToggle />
        <label>Investigation source{" "}
          <select aria-label="Investigation source" className="rounded border bg-background p-1" value={record?.case_id ?? ""} onChange={(e) => { select(e.target.value || null); setView(e.target.value ? "workspace" : "home"); }}>
            <option value="">Current dataset ({activeDataset.mode})</option>
            {cases.map((c) => <option value={c.case_id} key={c.case_id}>{c.title} · {c.status} · {c.case_id}</option>)}
          </select>
        </label>
        {!record && activeDataset.findings.length > 1 && <label>Finding{" "}
          <select aria-label="Finding" value={JSON.stringify(scenario.finding?.fanOutTransactionIds)} onChange={(e) => setFindingKey(e.target.value)}>
            {activeDataset.findings.map((f) => <option key={JSON.stringify(f.fanOutTransactionIds)} value={JSON.stringify(f.fanOutTransactionIds)}>{f.sourceAccount} → {f.collectorAccount}</option>)}
          </select>
        </label>}
        <Button size="sm" variant="outline" onClick={() => void useCaseStore.getState().refresh()}>Refresh cases</Button>
        {busy && <span role="status">Saving case…</span>}
      </div>
      {error && <p role="alert" className="px-3 py-2 text-sm text-destructive">{error}</p>}
      {!record && !activeDataset.graph && <p role="status" className="p-3 text-sm">{liveError ?? "Loading current dataset…"}</p>}
      {record && <CaseDecisionPanel key={`decision:${record.case_id}`} record={record} />}
      {view === "home" ? (
        <HomeView scenario={scenario} onOpenCase={() => void openCase()} className="min-h-0 flex-1" />
      ) : (
        <WorkspaceView key={record?.case_id ?? activeDataset.datasetKey} scenario={scenario} savedCase={record} caseOpen={!!record} onOpenCase={() => void openCase()} className="min-h-0 flex-1" />
      )}
    </div>
  );
}

