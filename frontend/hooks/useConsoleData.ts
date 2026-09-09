"use client";

import { useEffect, useMemo } from "react";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import { useAssessmentStore } from "@/lib/store/assessmentStore";
import { buildGraphSnapshot, graphSnapshotToTransactions } from "@/lib/services/graphBuilder";
import { buildAssessedGraphSnapshot } from "@/lib/services/assessmentGraph";
import { deriveAlerts } from "@/lib/services/alerts";
import { deriveCases } from "@/lib/services/cases";
import { computeNetworkMetrics } from "@/lib/services/metrics";
import type { Transaction } from "@/types/transaction";
import type { GraphSnapshot } from "@/types/graph";
import type { Finding } from "@/lib/services/rules/detector";
import type { AssessmentResult } from "@/types/assessment";

export type ActiveDatasetMode = "simulation" | "live" | "assessment";

/**
 * The one explicit description of "what data is currently being shown,"
 * derived exactly once per render and consumed by every panel (graph,
 * transaction list, metrics, inspectors, alerts, cases) below -- replacing
 * the previous pattern of each field independently checking
 * `hasAssessment`/`isLive` with its own (sometimes different) fallback.
 * That's what let live mode show a real backend graph next to the bundled
 * demo's transactions while alerts/cases stayed hardcoded empty: nothing
 * forced every field to agree on which dataset was actually active.
 */
export interface ActiveDataset {
  mode: ActiveDatasetMode;
  /**
   * Stable identity for the data currently shown. Changes exactly when
   * graph/transactions/findings below should be treated as a new dataset:
   * switching mode, a live fetch landing, or a new assessment completing.
   * Progressing simulation replay does NOT change this -- it's still the
   * same fixed fixture, just more of it revealed so far.
   */
  datasetKey: string;
  /** Live-fetch generation number; non-null only in "live" mode. */
  revision: number | null;
  /** The completed assessment this data came from; non-null only in "assessment" mode. */
  assessment: AssessmentResult | null;
  /**
   * When this data was last evaluated: the live fetch's completion time, or
   * the assessment's own `assessedAt`. Null for simulation (a replay of a
   * fixed fixture has no single "evaluated at" instant distinct from "now")
   * and for live mode before any fetch has completed.
   */
  evaluatedAt: string | null;
  graph: GraphSnapshot | null;
  transactions: Transaction[];
  findings: Finding[];
}

/**
 * Single derived-data pipeline shared by every layout: revealed
 * transactions -> graph/findings (simulation), the live backend's actual
 * response (live), or a completed assessment's own result (assessment) --
 * all normalized into one `ActiveDataset`, which alerts/cases/metrics/
 * transaction lists/inspectors all read from instead of deriving their own
 * mode-specific view. Precedence when more than one could apply: an active
 * assessment always wins (it's a deliberate, explicit analyst action that
 * supersedes the view until cleared -- see assessmentStore.startNewAssessment),
 * then live, then simulation.
 */
export function useConsoleData() {
  const transactions = useConsoleStore((s) => s.transactions);
  const revealedCount = useConsoleStore((s) => s.revealedCount);
  const dataMode = useConsoleStore((s) => s.dataMode);
  const liveGraph = useConsoleStore((s) => s.liveGraph);
  const liveFindings = useConsoleStore((s) => s.liveFindings);
  const liveStatus = useConsoleStore((s) => s.liveStatus);
  const liveError = useConsoleStore((s) => s.liveError);
  const liveRevision = useConsoleStore((s) => s.liveRevision);
  const liveEvaluatedAt = useConsoleStore((s) => s.liveEvaluatedAt);
  const assessmentResult = useAssessmentStore((s) => s.result);

  const selectedAccountId = useConsoleStore((s) => s.selectedAccountId);
  const selectedTransactionId = useConsoleStore((s) => s.selectedTransactionId);
  const activeCaseId = useConsoleStore((s) => s.activeCaseId);
  const consoleActions = useConsoleActions();

  const revealedTransactions = useMemo<Transaction[]>(
    () => transactions.slice(0, revealedCount),
    [transactions, revealedCount],
  );

  const simulationBuild = useMemo(() => buildGraphSnapshot(revealedTransactions), [revealedTransactions]);

  const isLive = dataMode === "live";
  const hasAssessment = assessmentResult !== null;

  const active: ActiveDataset = useMemo(() => {
    if (assessmentResult) {
      return {
        mode: "assessment",
        datasetKey: `assessment:${assessmentResult.assessedAt}`,
        revision: null,
        assessment: assessmentResult,
        evaluatedAt: assessmentResult.assessedAt,
        graph: buildAssessedGraphSnapshot(assessmentResult),
        transactions: assessmentResult.transactions,
        findings: assessmentResult.findings ?? [],
      };
    }
    if (isLive) {
      const graph = liveStatus === "ready" ? liveGraph : null;
      return {
        mode: "live",
        datasetKey: `live:${liveRevision}`,
        revision: liveRevision,
        assessment: null,
        evaluatedAt: liveEvaluatedAt,
        graph,
        transactions: graph ? graphSnapshotToTransactions(graph) : [],
        findings: graph ? liveFindings : [],
      };
    }
    return {
      mode: "simulation",
      datasetKey: "simulation",
      revision: null,
      assessment: null,
      evaluatedAt: null,
      graph: simulationBuild.graph,
      transactions: revealedTransactions,
      findings: simulationBuild.findings,
    };
  }, [assessmentResult, isLive, liveStatus, liveGraph, liveFindings, liveRevision, liveEvaluatedAt, simulationBuild, revealedTransactions]);

  // A selection that doesn't exist in the newly-active dataset must not
  // linger -- e.g. an account selected in simulation, then switching to a
  // live snapshot that never mentions it. Only corrects once the active
  // dataset actually has data (active.graph !== null) so an in-progress live
  // fetch doesn't clear a selection that may turn out to still be valid.
  useEffect(() => {
    if (!active.graph) return;
    if (selectedAccountId && !active.graph.nodes.some((n) => n.id === selectedAccountId)) {
      consoleActions.selectAccount(null);
    }
  }, [active.graph, selectedAccountId, consoleActions]);

  useEffect(() => {
    if (!active.graph) return;
    if (selectedTransactionId && !active.transactions.some((t) => t.id === selectedTransactionId)) {
      consoleActions.selectTransaction(null);
    }
  }, [active.graph, active.transactions, selectedTransactionId, consoleActions]);

  const alerts = useMemo(
    () => deriveAlerts(active.findings, active.transactions, { isReplayPosition: active.mode === "simulation" }),
    [active.findings, active.transactions, active.mode],
  );

  const cases = useMemo(() => deriveCases(active.findings), [active.findings]);

  useEffect(() => {
    if (activeCaseId && !cases.some((c) => c.id === activeCaseId)) {
      consoleActions.setActiveCase(null);
    }
  }, [cases, activeCaseId, consoleActions]);

  const metrics = useMemo(() => {
    if (!active.graph) return null;
    const base = computeNetworkMetrics(active.graph, alerts);
    if (active.mode === "assessment") {
      // Real pattern count from the assessment's own response, not the
      // (deliberately empty, see above) findings-derived alert count.
      return { ...base, activeAlerts: active.assessment!.patterns.length };
    }
    return base;
  }, [active.graph, active.mode, active.assessment, alerts]);

  return {
    dataMode,
    isLive,
    liveStatus,
    liveError,
    activeDataset: active,
    graph: active.graph,
    findings: active.findings,
    alerts,
    cases,
    metrics,
    revealedTransactions: active.transactions,
    allTransactions: transactions,
    totalTransactions: transactions.length,
    revealedCount,
    isReplayable: active.mode === "simulation",
    assessmentActive: hasAssessment,
    assessmentResult,
  };
}
