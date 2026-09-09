"use client";
import { create } from "zustand";
import { listSavedCases, openEvidenceCase, updateSavedCase, type SavedCase, type CaseStatus } from "@/lib/services/caseClient";
import type { Finding } from "@/types/finding";
import type { Transaction } from "@/types/transaction";

interface CaseState {
  baseUrl: string;
  generation: number;
  cases: SavedCase[];
  selectedId: string | null;
  error: string | null;
  busy: boolean;
  configure: (baseUrl: string) => void;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  open: (transactions: Transaction[], finding: Finding) => Promise<boolean>;
  update: (record: SavedCase, status: CaseStatus, note?: string) => Promise<boolean>;
}

function merge(current: SavedCase[], incoming: SavedCase[]): SavedCase[] {
  const records = new Map(current.map((record) => [record.case_id, record]));
  for (const record of incoming) {
    if ((records.get(record.case_id)?.revision ?? 0) <= record.revision) records.set(record.case_id, record);
  }
  return [...records.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export const useCaseStore = create<CaseState>((set, get) => ({
  baseUrl: "", generation: 0, cases: [], selectedId: null, error: null, busy: false,
  configure: (baseUrl) => {
    if (get().baseUrl === baseUrl) return;
    set((s) => ({ baseUrl, generation: s.generation + 1, cases: [], selectedId: null, error: null, busy: false }));
  },
  select: (selectedId) => set({ selectedId, error: null }),
  refresh: async () => {
    const { baseUrl, generation } = get();
    if (!baseUrl) return;
    try {
      const records = await listSavedCases(baseUrl);
      if (generation === get().generation) set((s) => ({ cases: merge(s.cases, records) }));
    } catch (error) {
      if (generation === get().generation) set({ error: error instanceof Error ? error.message : "Cases unavailable." });
    }
  },
  open: async (transactions, finding) => {
    if (get().busy) return false;
    const { baseUrl, generation } = get();
    set({ busy: true, error: null });
    try {
      const record = await openEvidenceCase(baseUrl, transactions, finding);
      if (generation !== get().generation) return false;
      set((s) => ({ cases: merge(s.cases, [record]), selectedId: record.case_id }));
      return true;
    } catch (error) {
      if (generation === get().generation) set({ error: error instanceof Error ? error.message : "Could not save case." });
      return false;
    } finally {
      if (generation === get().generation) set({ busy: false });
    }
  },
  update: async (record, status, note) => {
    if (get().busy) return false;
    const { baseUrl, generation } = get();
    set({ busy: true, error: null });
    try {
      const updated = await updateSavedCase(baseUrl, record, status, note);
      if (generation !== get().generation) return false;
      set((s) => ({ cases: merge(s.cases, [updated]) }));
      return true;
    } catch (error) {
      if (generation === get().generation) {
        set({ error: error instanceof Error ? error.message : "Could not update case." });
        await get().refresh();
      }
      return false;
    } finally {
      if (generation === get().generation) set({ busy: false });
    }
  },
}));
