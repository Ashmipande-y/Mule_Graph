"use client";

import { useMemo } from "react";
import { useConsoleData } from "./useConsoleData";
import { buildAccountDetail } from "@/lib/services/accountDetail";

export function useAccountDetail(accountId: string | null) {
  const { graph, revealedTransactions, findings } = useConsoleData();

  return useMemo(() => {
    if (!accountId || !graph) return null;
    const node = graph.nodes.find((n) => n.id === accountId);
    return buildAccountDetail(accountId, node, revealedTransactions, findings);
  }, [accountId, graph, revealedTransactions, findings]);
}
