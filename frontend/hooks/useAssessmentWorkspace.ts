"use client";

import { useMemo } from "react";
import { useConsoleData } from "./useConsoleData";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { useAssessmentStore, useAssessmentActions } from "@/lib/store/assessmentStore";
import { transactionSetsEqual } from "@/lib/services/transactionValidation";
import type { Transaction } from "@/types/transaction";

function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.timestamp === b.timestamp ? (a.id < b.id ? -1 : 1) : a.timestamp < b.timestamp ? -1 : 1));
}

/**
 * Assembles everything the assessment workspace UI needs: the current
 * network reconstructed from whatever the app is currently displaying
 * (works the same in simulation or live data mode, since both ultimately
 * expose a GraphSnapshot with edges carrying full transaction fields), the
 * pending list, the exact set that would be submitted, and staleness
 * relative to the last completed result.
 */
export function useAssessmentWorkspace() {
  const { graph } = useConsoleData();
  const liveBaseUrl = useConsoleStore((s) => s.liveBaseUrl);

  const isOpen = useAssessmentStore((s) => s.isOpen);
  const formMode = useAssessmentStore((s) => s.formMode);
  const editingTransactionId = useAssessmentStore((s) => s.editingTransactionId);
  const pendingTransactions = useAssessmentStore((s) => s.pendingTransactions);
  const networkMode = useAssessmentStore((s) => s.networkMode);
  const status = useAssessmentStore((s) => s.status);
  const result = useAssessmentStore((s) => s.result);
  const previousResult = useAssessmentStore((s) => s.previousResult);
  const error = useAssessmentStore((s) => s.error);
  const actions = useAssessmentActions();

  const currentNetworkTransactions = useMemo<Transaction[]>(() => {
    if (!graph) return [];
    return graph.edges.map((edge) => ({
      id: edge.id,
      sender: edge.source,
      receiver: edge.target,
      amount: edge.amount,
      timestamp: edge.timestamp,
    }));
  }, [graph]);

  const submissionSet = useMemo<Transaction[]>(() => {
    const base = networkMode === "include-current" ? currentNetworkTransactions : [];
    return sortTransactions([...base, ...pendingTransactions]);
  }, [networkMode, currentNetworkTransactions, pendingTransactions]);

  const existingAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tx of currentNetworkTransactions) {
      ids.add(tx.sender);
      ids.add(tx.receiver);
    }
    for (const tx of pendingTransactions) {
      ids.add(tx.sender);
      ids.add(tx.receiver);
    }
    return [...ids].sort();
  }, [currentNetworkTransactions, pendingTransactions]);

  /** IDs already in use, for uniqueness validation -- always checked against both pending and the current network, regardless of network mode, so a collision is never accidentally allowed through. */
  const idsInUse = useMemo(() => {
    const ids = new Set<string>();
    for (const tx of currentNetworkTransactions) ids.add(tx.id);
    for (const tx of pendingTransactions) ids.add(tx.id);
    return ids;
  }, [currentNetworkTransactions, pendingTransactions]);

  const isStale = status === "success" && result !== null && !transactionSetsEqual(submissionSet, result.transactions);

  /** Anchor for defaulting a new transaction's timestamp -- the latest timestamp anywhere in scope (network + pending), or null if there's nothing yet. */
  const latestKnownTimestamp = useMemo(() => {
    const all = [...currentNetworkTransactions, ...pendingTransactions];
    if (all.length === 0) return null;
    return all.reduce((latest, tx) => (tx.timestamp > latest ? tx.timestamp : latest), all[0].timestamp);
  }, [currentNetworkTransactions, pendingTransactions]);

  const editingTransaction = editingTransactionId
    ? (pendingTransactions.find((tx) => tx.id === editingTransactionId) ?? null)
    : null;

  return {
    isOpen,
    formMode,
    editingTransaction,
    pendingTransactions,
    networkMode,
    currentNetworkTransactions,
    submissionSet,
    existingAccountIds,
    idsInUse,
    latestKnownTimestamp,
    status,
    result,
    previousResult,
    error,
    isStale,
    liveBaseUrl,
    canRun: pendingTransactions.length > 0 && status !== "loading",
    actions,
    runAssessment: () => actions.runAssessment(liveBaseUrl, submissionSet),
  };
}
