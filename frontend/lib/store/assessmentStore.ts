"use client";

import { create } from "zustand";
import type { Transaction } from "@/types/transaction";
import type { AssessmentNetworkMode, AssessmentResult, AssessmentRunStatus } from "@/types/assessment";
import { AssessmentApiError, submitAssessment } from "@/lib/services/assessmentClient";
import { CANONICAL_TRANSACTIONS } from "@/lib/services/dataSource";
import { useConsoleStore } from "./consoleStore";

export type FormMode = "hidden" | "add" | "edit";

interface AssessmentState {
  isOpen: boolean;
  formMode: FormMode;
  editingTransactionId: string | null;

  pendingTransactions: Transaction[];
  networkMode: AssessmentNetworkMode;

  status: AssessmentRunStatus;
  result: AssessmentResult | null;
  previousResult: AssessmentResult | null;
  error: string | null;
}

interface AssessmentActions {
  openWorkspace: (options?: { startAdding?: boolean }) => void;
  closeWorkspace: () => void;
  startAdd: () => void;
  startEdit: (id: string) => void;
  cancelForm: () => void;

  addPending: (tx: Transaction) => void;
  updatePending: (id: string, tx: Transaction) => void;
  removePending: (id: string) => void;

  setNetworkMode: (mode: AssessmentNetworkMode) => void;
  loadExampleNetwork: () => boolean;

  runAssessment: (baseUrl: string, transactionsToSubmit: readonly Transaction[]) => Promise<void>;
  startNewAssessment: () => void;
}

type AssessmentStore = AssessmentState & { actions: AssessmentActions };

/** Pausing replay whenever the workspace is entered so the submitted dataset can't shift mid-preparation. */
function pauseReplay(): void {
  useConsoleStore.getState().actions.pause();
}

export const useAssessmentStore = create<AssessmentStore>()((set, get) => ({
  isOpen: false,
  formMode: "hidden",
  editingTransactionId: null,

  pendingTransactions: [],
  networkMode: "include-current",

  status: "idle",
  result: null,
  previousResult: null,
  error: null,

  actions: {
    openWorkspace: (options) => {
      pauseReplay();
      set({ isOpen: true, formMode: options?.startAdding ? "add" : "hidden" });
    },
    closeWorkspace: () => set({ isOpen: false, formMode: "hidden", editingTransactionId: null }),

    startAdd: () => {
      pauseReplay();
      set({ formMode: "add", editingTransactionId: null });
    },
    startEdit: (id) => {
      pauseReplay();
      set({ formMode: "edit", editingTransactionId: id });
    },
    cancelForm: () => set({ formMode: "hidden", editingTransactionId: null }),

    addPending: (tx) =>
      set((s) => ({
        pendingTransactions: [...s.pendingTransactions, tx],
        formMode: "hidden",
      })),
    updatePending: (id, tx) =>
      set((s) => ({
        pendingTransactions: s.pendingTransactions.map((p) => (p.id === id ? tx : p)),
        formMode: "hidden",
        editingTransactionId: null,
      })),
    removePending: (id) =>
      set((s) => ({ pendingTransactions: s.pendingTransactions.filter((p) => p.id !== id) })),

    setNetworkMode: (mode) => set({ networkMode: mode }),
    /** Returns true if this replaced pending transactions the analyst had already entered, so the caller can say so honestly. */
    loadExampleNetwork: () => {
      pauseReplay();
      const replacedExisting = get().pendingTransactions.length > 0;
      set({
        pendingTransactions: CANONICAL_TRANSACTIONS.map((tx) => ({ ...tx })),
        networkMode: "new-only",
        formMode: "hidden",
      });
      return replacedExisting;
    },

    runAssessment: async (baseUrl, transactionsToSubmit) => {
      pauseReplay();
      const priorResult = get().result;
      set({ status: "loading", error: null, previousResult: priorResult });
      try {
        const result = await submitAssessment(baseUrl, transactionsToSubmit);
        // Once assessed, these transactions become part of the displayed
        // network (see hooks/useConsoleData.ts's assessment override) --
        // clearing them here is what keeps a later "current network" read
        // from double-counting them as both "network" and "pending" in the
        // next submission preview.
        set({ status: "success", result, error: null, pendingTransactions: [] });
      } catch (error) {
        const message =
          error instanceof AssessmentApiError ? error.message : "Unexpected error contacting the backend.";
        set({ status: "error", error: message });
      }
    },

    startNewAssessment: () =>
      set({
        pendingTransactions: [],
        result: null,
        previousResult: null,
        status: "idle",
        error: null,
        formMode: "hidden",
        editingTransactionId: null,
      }),
  },
}));

export const useAssessmentActions = () => useAssessmentStore((s) => s.actions);
