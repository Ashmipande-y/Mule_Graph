"use client";
import { create } from "zustand";
import type { Transaction } from "@/types/transaction";
import type { AssessmentResult } from "@/types/assessment";
import { submitAssessment } from "@/lib/services/assessmentClient";

interface CustomCaseState {
  transactions: Transaction[];
  result: AssessmentResult | null;
  resultBaseUrl: string | null;
  busy: boolean;
  error: string | null;
  revision: number;
  setTransactions: (transactions: Transaction[]) => void;
  assess: (baseUrl: string) => Promise<void>;
}

// Kept across route navigation; drafts are not saved to the server until a case is opened.
export const useCustomCaseStore = create<CustomCaseState>((set, get) => ({
  transactions: [], result: null, resultBaseUrl: null, busy: false, error: null, revision: 0,
  setTransactions: (transactions) => set((s) => ({ transactions, result: null, resultBaseUrl: null, error: null, revision: s.revision + 1, busy: false })),
  assess: async (baseUrl) => {
    const { transactions, revision, busy } = get();
    if (busy || transactions.length === 0) return;
    set({ busy: true, error: null, result: null, resultBaseUrl: null });
    try {
      const result = await submitAssessment(baseUrl, transactions);
      if (revision === get().revision) set({ result, resultBaseUrl: baseUrl });
    } catch (error) {
      if (revision === get().revision) set({ error: error instanceof Error ? error.message : "Assessment failed. Please try again." });
    } finally {
      if (revision === get().revision) set({ busy: false });
    }
  },
}));
