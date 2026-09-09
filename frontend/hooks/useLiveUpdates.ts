"use client";
import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "@/types/event";
import { LiveUpdatesClient } from "@/lib/services/liveUpdates";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { useCaseStore } from "@/lib/store/caseStore";
import { useAmlStore } from "@/lib/store/amlStore";

export function useLiveUpdates(baseUrl: string) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const clientRef = useRef<LiveUpdatesClient | null>(null);

  useEffect(() => {
    const cases = useCaseStore.getState();
    cases.configure(baseUrl);
    const refreshCases = () => void useCaseStore.getState().refresh();
    const refreshState = () => {
      refreshCases();
      const console = useConsoleStore.getState();
      if (console.dataMode === "live") void console.actions.fetchLive();
    };
    const updated = () => setLastUpdated(new Date().toISOString());
    const client = new LiveUpdatesClient({
      baseUrl,
      onStatusChange: setStatus,
      onConnected: () => { updated(); refreshState(); },
      onCaseUpdated: () => { updated(); refreshCases(); },
      onAssessmentCompleted: updated,
      onTransactionCommitted: () => {
        updated();
        const aml = useAmlStore.getState();
        void aml.actions.fetchSummary();
        void aml.actions.fetchGraph();
        void aml.actions.fetchTransactionsPage();
      },
      onResyncRequired: () => { updated(); refreshState(); },
    });
    clientRef.current = client;
    client.connect();
    return () => { client.disconnect(); clientRef.current = null; };
  }, [baseUrl]);

  return { status, lastUpdated, reconnect: () => clientRef.current?.connect() };
}

