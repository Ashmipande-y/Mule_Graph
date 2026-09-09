"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, Search, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/shared/States";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { GraphAccessibleList } from "@/components/graph/GraphAccessibleList";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { AmlDatasetSummaryCard } from "./AmlDatasetSummaryCard";
import { AmlTransactionTable } from "./AmlTransactionTable";
import { AmlRulesFindingsPanel } from "./AmlRulesFindingsPanel";
import { AmlTransactionDrawer } from "./AmlTransactionDrawer";
import { useAmlStore, useAmlActions } from "@/lib/store/amlStore";
import { amlGraphToGraphSnapshot } from "@/lib/services/amlGraphMapper";
import { formatPaiseAsInr } from "@/lib/services/amlMoney";
import { formatFullUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AmlDatasetView() {
  const summaryStatus = useAmlStore((s) => s.summaryStatus);
  const summary = useAmlStore((s) => s.summary);
  const summaryError = useAmlStore((s) => s.summaryError);

  const graphStatus = useAmlStore((s) => s.graphStatus);
  const graph = useAmlStore((s) => s.graph);
  const graphError = useAmlStore((s) => s.graphError);

  const transactionsStatus = useAmlStore((s) => s.transactionsStatus);
  const page = useAmlStore((s) => s.page);
  const transactionsError = useAmlStore((s) => s.transactionsError);
  const cursor = useAmlStore((s) => s.cursor);
  const limit = useAmlStore((s) => s.limit);

  const selectedAccountId = useAmlStore((s) => s.selectedAccountId);
  const selectedTransactionId = useAmlStore((s) => s.selectedTransactionId);
  const isDrawerOpen = useAmlStore((s) => s.isDrawerOpen);
  const filterAccount = useAmlStore((s) => s.filterAccount);

  const labeledNetworksStatus = useAmlStore((s) => s.labeledNetworksStatus);
  const labeledNetworks = useAmlStore((s) => s.labeledNetworks);
  const labeledNetworksSourceNote = useAmlStore((s) => s.labeledNetworksSourceNote);
  const labeledNetworksError = useAmlStore((s) => s.labeledNetworksError);

  const actions = useAmlActions();
  const [seedInput, setSeedInput] = useState("");

  useEffect(() => {
    void actions.fetchSummary();
    void actions.fetchGraph();
    void actions.fetchTransactionsPage();
    void actions.fetchLabeledNetworks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const graphSnapshot = useMemo(() => (graph ? amlGraphToGraphSnapshot(graph) : null), [graph]);

  // Which edges in the *currently loaded* graph are real, benchmark-labeled
  // laundering transactions -- distinct from this graph's own (often
  // UNASSESSED) ml_rules risk. Highlighted regardless of whether the
  // current graph was reached via a labeled-network chip or manual seed
  // entry, since the flag is real either way.
  const labeledEdgeIds = useMemo(() => {
    if (!graph) return new Set<string>();
    return new Set(graph.edges.filter((e) => e.isLabeledLaundering).map((e) => e.id));
  }, [graph]);

  const knownAccountIds = useMemo(() => {
    const ids = new Set<string>();
    graph?.nodes.forEach((n) => ids.add(n.id));
    page?.items.forEach((tx) => {
      ids.add(tx.sender);
      ids.add(tx.receiver);
    });
    return [...ids].sort();
  }, [graph, page]);

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    page?.items.forEach((tx) => ids.add(tx.id));
    graph?.edges.forEach((e) => ids.add(e.id));
    return ids;
  }, [page, graph]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">AML Dataset</h1>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="size-3.5" aria-hidden="true" />
            IBM AML benchmark
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void actions.fetchSummary();
              void actions.fetchGraph();
              void actions.fetchTransactionsPage({ cursor });
            }}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button onClick={() => actions.openDrawer()}>Add transaction</Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        {summaryStatus === "loading" && !summary && <LoadingState label="Loading dataset summary…" />}
        {summaryStatus === "error" && <ErrorState title="Could not load dataset summary" description={summaryError ?? undefined} />}
        {summary && <AmlDatasetSummaryCard summary={summary} />}

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-h-0 min-w-0 flex-[2] flex-col gap-2">
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  <ShieldQuestion className="size-3.5" aria-hidden="true" />
                  Ground-truth labeled networks
                </p>
                {labeledNetworksStatus === "loading" && <span className="text-[0.65rem] text-muted-foreground">Loading…</span>}
              </div>
              {labeledNetworksStatus === "error" && (
                <p className="text-xs text-muted-foreground">{labeledNetworksError ?? "Could not load labeled networks."}</p>
              )}
              {labeledNetworksStatus === "ready" && labeledNetworks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No ground-truth-labeled examples available in this deployment (optional dataset layer not present).
                </p>
              )}
              {labeledNetworks.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {labeledNetworks.map((n) => (
                      <button
                        key={n.seedAccount}
                        type="button"
                        onClick={() => void actions.fetchGraph(n.seedAccount)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[0.7rem] transition-colors",
                          graph?.seedAccount === n.seedAccount
                            ? "border-risk-high/40 bg-risk-high/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="font-data">{n.seedAccount.split(":").slice(1).join(":")}</span>
                        <span className="text-muted-foreground">
                          {n.labeledLaunderingTransactionCount} labeled tx
                        </span>
                        <RiskBadge level={n.mlRulesRiskLevel} showIcon={false} className="h-4 px-1" />
                      </button>
                    ))}
                  </div>
                  {labeledNetworksSourceNote && <p className="text-[0.65rem] text-muted-foreground">{labeledNetworksSourceNote}</p>}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void actions.fetchGraph(seedInput.trim() || null);
                  }}
                  placeholder="Seed graph from an account ID…"
                  className="pl-7 font-data"
                  aria-label="Seed the graph from an account"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void actions.fetchGraph(seedInput.trim() || null)}>
                View
              </Button>
              {graph?.seedAccount && (
                <Button variant="ghost" size="sm" onClick={() => void actions.fetchGraph(null)}>
                  Reset to hub
                </Button>
              )}
            </div>

            <div className="relative min-h-0 flex-1 rounded-md border border-border">
              {graphStatus === "loading" && !graphSnapshot && <LoadingState label="Loading graph…" />}
              {graphStatus === "error" && <ErrorState title="Could not load the graph" description={graphError ?? undefined} />}
              {graphSnapshot && (
                <>
                  <GraphCanvas
                    graph={graphSnapshot}
                    selectedAccountId={selectedAccountId}
                    onSelectAccount={(id) => actions.selectAccount(id)}
                    highlightEdgeIds={labeledEdgeIds}
                    className="absolute inset-0"
                  />
                  <div className="absolute bottom-2 left-2 rounded-md border border-border bg-panel/95 p-2 shadow-sm">
                    <GraphLegend edgeHighlightLabel={labeledEdgeIds.size > 0 ? "Ground-truth labeled transaction" : undefined} />
                  </div>
                </>
              )}
            </div>
            <details className="shrink-0 rounded-md border border-border">
              <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                Accessible account list
              </summary>
              {graphSnapshot && (
                <GraphAccessibleList
                  graph={graphSnapshot}
                  selectedAccountId={selectedAccountId}
                  onSelectAccount={(id) => actions.selectAccount(id)}
                  className="max-h-40"
                />
              )}
            </details>
          </div>

          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto">
            {graph && <AmlRulesFindingsPanel findings={graph.rulesFindings} />}
            {selectedAccountId && (
              <div className="rounded-md border border-status-info/30 bg-status-info/10 p-2.5 text-xs">
                <p className="font-data font-semibold text-foreground">{selectedAccountId}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void actions.fetchGraph(selectedAccountId)}>
                    Center graph here
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void actions.fetchTransactionsPage({ cursor: 0, account: selectedAccountId })}
                  >
                    Filter transactions to this account
                  </Button>
                </div>
              </div>
            )}
            {selectedTransactionId && page && (
              <div className="rounded-md border border-border bg-panel-2 p-2.5 text-xs">
                {(() => {
                  const tx = page.items.find((t) => t.id === selectedTransactionId);
                  if (!tx) return <p className="text-muted-foreground">Not on the current page.</p>;
                  return (
                    <dl className="grid grid-cols-1 gap-1 font-data">
                      <div>
                        <dt className="text-muted-foreground">ID</dt>
                        <dd className="text-foreground">{tx.id}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Amount</dt>
                        <dd className="text-foreground">{formatPaiseAsInr(tx.amountPaise)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Timestamp</dt>
                        <dd className="text-foreground">{formatFullUtc(tx.timestamp)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Format</dt>
                        <dd className="text-foreground">{tx.paymentFormat}</dd>
                      </div>
                    </dl>
                  );
                })()}
              </div>
            )}
          </aside>
        </div>

        <div className="flex h-72 shrink-0 flex-col rounded-md border border-border">
          {filterAccount && (
            <div className="flex items-center justify-between border-b border-border px-2 py-1 text-xs text-muted-foreground">
              <span>
                Filtered to <span className="font-data text-foreground">{filterAccount}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => void actions.fetchTransactionsPage({ cursor: 0, account: null })}>
                Clear filter
              </Button>
            </div>
          )}
          <AmlTransactionTable
            status={transactionsStatus}
            page={page}
            error={transactionsError}
            selectedTransactionId={selectedTransactionId}
            onSelectTransaction={(id) => actions.selectTransaction(id)}
            onSelectAccount={(id) => actions.selectAccount(id)}
            onCursorChange={(next) => void actions.fetchTransactionsPage({ cursor: next })}
            cursor={cursor}
            limit={limit}
            className="min-h-0 flex-1"
          />
        </div>
      </main>

      <AmlTransactionDrawer
        open={isDrawerOpen}
        onOpenChange={(open) => (open ? actions.openDrawer() : actions.closeDrawer())}
        knownAccountIds={knownAccountIds}
        existingIds={existingIds}
      />
    </div>
  );
}
