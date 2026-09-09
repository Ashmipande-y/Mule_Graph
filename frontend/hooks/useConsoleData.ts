"use client";

import { useMemo } from "react";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { useAssessmentStore } from "@/lib/store/assessmentStore";
import { buildGraphSnapshot } from "@/lib/services/graphBuilder";
import { buildAssessedGraphSnapshot } from "@/lib/services/assessmentGraph";
import { deriveAlerts } from "@/lib/services/alerts";
import { deriveCases } from "@/lib/services/cases";
import { computeNetworkMetrics } from "@/lib/services/metrics";
import type { Transaction } from "@/types/transaction";

/**
 * Single derived-data pipeline shared by every layout: revealed
 * transactions -> graph/findings (simulation) or live snapshot (API mode)
 * -> alerts/cases/metrics. Keeping this in one hook is what lets five very
 * different layouts stay consistent without recomputing detection logic
 * five different ways.
 *
 * Once a transaction assessment has completed successfully, its result
 * overrides the displayed graph/transactions/metrics here -- see "Update
 * the existing visualization" in the assessment feature: this is the one
 * place that override happens, so every layout picks it up automatically.
 * The override uses only what the assessment response actually returned
 * (via buildAssessedGraphSnapshot) -- never recomputed risk, never
 * fabricated evidence. It stays in effect (even once stale) until the
 * analyst starts a new assessment, per "keep the previous completed result
 * visible... clearly labeled."
 */
export function useConsoleData() {
  const transactions = useConsoleStore((s) => s.transactions);
  const revealedCount = useConsoleStore((s) => s.revealedCount);
  const dataMode = useConsoleStore((s) => s.dataMode);
  const liveGraph = useConsoleStore((s) => s.liveGraph);
  const liveStatus = useConsoleStore((s) => s.liveStatus);
  const liveError = useConsoleStore((s) => s.liveError);
  const assessmentResult = useAssessmentStore((s) => s.result);

  const revealedTransactions = useMemo<Transaction[]>(
    () => transactions.slice(0, revealedCount),
    [transactions, revealedCount],
  );

  const simulation = useMemo(() => buildGraphSnapshot(revealedTransactions), [revealedTransactions]);

  const alerts = useMemo(
    () => deriveAlerts(simulation.findings, revealedTransactions),
    [simulation.findings, revealedTransactions],
  );

  const cases = useMemo(() => deriveCases(simulation.findings), [simulation.findings]);

  const isLive = dataMode === "live";
  const baseGraph = isLive ? liveGraph : simulation.graph;
  const baseTransactions = isLive ? transactions : revealedTransactions;

  const assessedGraph = useMemo(
    () => (assessmentResult ? buildAssessedGraphSnapshot(assessmentResult) : null),
    [assessmentResult],
  );

  const hasAssessment = assessedGraph !== null;
  const graph = hasAssessment ? assessedGraph : baseGraph;
  const displayedTransactions = hasAssessment ? assessmentResult!.transactions : baseTransactions;

  const metrics = useMemo(() => {
    if (!graph) return null;
    const base = computeNetworkMetrics(graph, hasAssessment ? [] : isLive ? [] : alerts);
    if (hasAssessment) {
      return { ...base, activeAlerts: assessmentResult!.patterns.length };
    }
    return base;
  }, [graph, alerts, isLive, hasAssessment, assessmentResult]);

  return {
    dataMode,
    isLive,
    liveStatus,
    liveError,
    graph,
    findings: hasAssessment || isLive ? [] : simulation.findings,
    alerts: hasAssessment || isLive ? [] : alerts,
    cases: hasAssessment || isLive ? [] : cases,
    metrics,
    revealedTransactions: displayedTransactions,
    allTransactions: transactions,
    totalTransactions: transactions.length,
    revealedCount,
    isReplayable: !isLive && !hasAssessment,
    assessmentActive: hasAssessment,
    assessmentResult,
  };
}
