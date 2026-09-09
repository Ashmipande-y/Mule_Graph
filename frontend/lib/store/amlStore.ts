"use client";

import { create } from "zustand";
import type { AmlAssessResult, AmlDatasetSummary, AmlGraphSnapshot, AmlTransaction, AmlTransactionPage } from "@/types/aml";
import {
  AmlApiError,
  assessAmlTransactions,
  commitAmlTransactions,
  fetchAmlGraph,
  fetchAmlSummary,
  fetchAmlTransactions,
} from "@/lib/services/amlClient";
import { DEFAULT_LIVE_BASE_URL } from "@/lib/services/dataSource";

export type FetchStatus = "idle" | "loading" | "ready" | "error";

interface AmlState {
  baseUrl: string;

  summaryStatus: FetchStatus;
  summary: AmlDatasetSummary | null;
  summaryError: string | null;

  graphStatus: FetchStatus;
  graph: AmlGraphSnapshot | null;
  graphError: string | null;
  seedAccount: string | null;
  maxNodes: number;
  maxEdges: number;

  transactionsStatus: FetchStatus;
  page: AmlTransactionPage | null;
  transactionsError: string | null;
  cursor: number;
  limit: number;
  filterAccount: string | null;

  selectedAccountId: string | null;
  selectedTransactionId: string | null;

  isDrawerOpen: boolean;
  draftTransaction: AmlTransaction | null;
  assessStatus: FetchStatus;
  assessResult: AmlAssessResult | null;
  assessedTransaction: AmlTransaction | null; // exactly what was submitted, for staleness comparison
  assessError: string | null;
  commitStatus: FetchStatus;
  commitError: string | null;
}

interface AmlActions {
  setBaseUrl: (url: string) => void;

  fetchSummary: () => Promise<void>;
  fetchGraph: (seedAccount?: string | null) => Promise<void>;
  fetchTransactionsPage: (options?: { cursor?: number; account?: string | null }) => Promise<void>;
  setFilterAccount: (account: string | null) => void;

  selectAccount: (id: string | null) => void;
  selectTransaction: (id: string | null) => void;

  openDrawer: () => void;
  closeDrawer: () => void;
  setDraftTransaction: (tx: AmlTransaction) => void;
  clearDraft: () => void;
  runAssessment: () => Promise<void>;
  commitDraftToSession: () => Promise<void>;
}

type AmlStore = AmlState & { actions: AmlActions };

export const useAmlStore = create<AmlStore>()((set, get) => ({
  baseUrl: DEFAULT_LIVE_BASE_URL,

  summaryStatus: "idle",
  summary: null,
  summaryError: null,

  graphStatus: "idle",
  graph: null,
  graphError: null,
  seedAccount: null,
  maxNodes: 40,
  maxEdges: 120,

  transactionsStatus: "idle",
  page: null,
  transactionsError: null,
  cursor: 0,
  limit: 25,
  filterAccount: null,

  selectedAccountId: null,
  selectedTransactionId: null,

  isDrawerOpen: false,
  draftTransaction: null,
  assessStatus: "idle",
  assessResult: null,
  assessedTransaction: null,
  assessError: null,
  commitStatus: "idle",
  commitError: null,

  actions: {
    setBaseUrl: (url) => set({ baseUrl: url }),

    fetchSummary: async () => {
      set({ summaryStatus: "loading", summaryError: null });
      try {
        const summary = await fetchAmlSummary(get().baseUrl);
        set({ summaryStatus: "ready", summary });
      } catch (error) {
        set({
          summaryStatus: "error",
          summaryError: error instanceof AmlApiError ? error.message : "Unexpected error contacting the backend.",
        });
      }
    },

    fetchGraph: async (seedAccount) => {
      const account = seedAccount === undefined ? get().seedAccount : seedAccount;
      set({ graphStatus: "loading", graphError: null, seedAccount: account ?? null });
      try {
        const graph = await fetchAmlGraph(get().baseUrl, {
          account: account ?? undefined,
          maxNodes: get().maxNodes,
          maxEdges: get().maxEdges,
        });
        set({ graphStatus: "ready", graph });
      } catch (error) {
        set({
          graphStatus: "error",
          graphError: error instanceof AmlApiError ? error.message : "Unexpected error contacting the backend.",
        });
      }
    },

    fetchTransactionsPage: async (options) => {
      const cursor = options?.cursor ?? 0;
      const account = options?.account === undefined ? get().filterAccount : options.account;
      set({ transactionsStatus: "loading", transactionsError: null, cursor, filterAccount: account ?? null });
      try {
        const page = await fetchAmlTransactions(get().baseUrl, {
          cursor,
          limit: get().limit,
          account: account ?? undefined,
        });
        set({ transactionsStatus: "ready", page });
      } catch (error) {
        set({
          transactionsStatus: "error",
          transactionsError: error instanceof AmlApiError ? error.message : "Unexpected error contacting the backend.",
        });
      }
    },

    setFilterAccount: (account) => set({ filterAccount: account }),

    selectAccount: (id) => set({ selectedAccountId: id }),
    selectTransaction: (id) => set({ selectedTransactionId: id }),

    openDrawer: () => set({ isDrawerOpen: true }),
    closeDrawer: () => set({ isDrawerOpen: false }),

    setDraftTransaction: (tx) => set({ draftTransaction: tx }),
    clearDraft: () =>
      set({
        draftTransaction: null,
        assessStatus: "idle",
        assessResult: null,
        assessedTransaction: null,
        assessError: null,
        commitStatus: "idle",
        commitError: null,
      }),

    runAssessment: async () => {
      const draft = get().draftTransaction;
      if (!draft) return;
      set({ assessStatus: "loading", assessError: null });
      try {
        const result = await assessAmlTransactions(get().baseUrl, [draft]);
        set({ assessStatus: "ready", assessResult: result, assessedTransaction: draft, commitStatus: "idle", commitError: null });
      } catch (error) {
        set({
          assessStatus: "error",
          assessError: error instanceof AmlApiError ? error.message : "Unexpected error contacting the backend.",
        });
      }
    },

    commitDraftToSession: async () => {
      const draft = get().draftTransaction;
      if (!draft) return;
      set({ commitStatus: "loading", commitError: null });
      try {
        await commitAmlTransactions(get().baseUrl, [draft]);
        set({ commitStatus: "ready" });
        // Refresh whatever's currently visible so the newly-committed
        // transaction shows up immediately, per "consistent graph/table
        // updates."
        await Promise.all([
          get().actions.fetchSummary(),
          get().actions.fetchGraph(get().seedAccount),
          get().actions.fetchTransactionsPage({ cursor: get().cursor, account: get().filterAccount }),
        ]);
      } catch (error) {
        set({
          commitStatus: "error",
          commitError: error instanceof AmlApiError ? error.message : "Unexpected error contacting the backend.",
        });
      }
    },
  },
}));

export const useAmlActions = () => useAmlStore((s) => s.actions);
