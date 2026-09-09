"use client";

import { create } from "zustand";
import type { RiskLevel } from "@/types/risk";
import type { InvestigationStatus, SimulatedActionState, AnalystNote, ActivityLogEntry, ActivityType } from "@/types/investigation";
import { createSimulatedActionState } from "@/types/investigation";
import { CANONICAL_TRANSACTIONS, DEFAULT_LIVE_BASE_URL, type DataMode } from "@/lib/services/dataSource";
import { fetchLiveGraph, LiveApiError } from "@/lib/services/apiClient";
import type { GraphSnapshot } from "@/types/graph";

export const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
export type SpeedMultiplier = (typeof SPEED_OPTIONS)[number];

const BASE_TICK_MS = 1400;

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function log(entries: ActivityLogEntry[], accountId: string, type: ActivityType, message: string): ActivityLogEntry[] {
  const entry: ActivityLogEntry = { id: newId("LOG"), accountId, type, message, createdAt: new Date().toISOString() };
  return [entry, ...entries].slice(0, 200);
}

interface ConsoleState {
  transactions: typeof CANONICAL_TRANSACTIONS;
  revealedCount: number;
  playing: boolean;
  speed: SpeedMultiplier;

  dataMode: DataMode;
  liveBaseUrl: string;
  liveStatus: "idle" | "loading" | "ready" | "error";
  liveGraph: GraphSnapshot | null;
  liveError: string | null;

  selectedAccountId: string | null;
  selectedTransactionId: string | null;
  searchQuery: string;
  riskFilter: RiskLevel[];
  activeCaseId: string | null;
  activeLayout: string;

  investigationStatus: Record<string, InvestigationStatus>;
  simulatedActions: Record<string, SimulatedActionState>;
  notes: Record<string, AnalystNote[]>;
  activityLog: ActivityLogEntry[];
}

interface ConsoleActions {
  play: () => void;
  pause: () => void;
  reset: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  seek: (index: number) => void;
  setSpeed: (speed: SpeedMultiplier) => void;

  setDataMode: (mode: DataMode) => void;
  setLiveBaseUrl: (url: string) => void;
  fetchLive: () => Promise<void>;

  selectAccount: (id: string | null) => void;
  selectTransaction: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleRiskFilter: (level: RiskLevel) => void;
  clearRiskFilter: () => void;
  setActiveCase: (id: string | null) => void;
  setActiveLayout: (layout: string) => void;

  setInvestigationStatus: (accountId: string, status: InvestigationStatus) => void;
  investigate: (accountId: string) => void;
  flag: (accountId: string) => void;
  unflag: (accountId: string) => void;
  freeze: (accountId: string) => void;
  unfreeze: (accountId: string) => void;
  addNote: (accountId: string, text: string) => void;
}

type ConsoleStore = ConsoleState & { actions: ConsoleActions };

let tickHandle: ReturnType<typeof setInterval> | null = null;
function clearTick() {
  if (tickHandle !== null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

export const useConsoleStore = create<ConsoleStore>()((set, get) => ({
  transactions: CANONICAL_TRANSACTIONS,
  revealedCount: CANONICAL_TRANSACTIONS.length,
  playing: false,
  speed: 1,

  dataMode: "simulation",
  liveBaseUrl: DEFAULT_LIVE_BASE_URL,
  liveStatus: "idle",
  liveGraph: null,
  liveError: null,

  selectedAccountId: null,
  selectedTransactionId: null,
  searchQuery: "",
  riskFilter: [],
  activeCaseId: null,
  activeLayout: "command",

  investigationStatus: {},
  simulatedActions: {},
  notes: {},
  activityLog: [],

  actions: {
    play: () => {
      if (get().playing) return;
      clearTick();
      set({ playing: true });
      tickHandle = setInterval(() => {
        const { revealedCount, transactions } = get();
        if (revealedCount >= transactions.length) {
          clearTick();
          set({ playing: false });
          return;
        }
        set({ revealedCount: revealedCount + 1 });
      }, BASE_TICK_MS / get().speed);
    },
    pause: () => {
      clearTick();
      set({ playing: false });
    },
    reset: () => {
      clearTick();
      set({ playing: false, revealedCount: 0 });
    },
    stepForward: () =>
      set((s) => ({ revealedCount: Math.min(s.transactions.length, s.revealedCount + 1) })),
    stepBackward: () => set((s) => ({ revealedCount: Math.max(0, s.revealedCount - 1) })),
    seek: (index) =>
      set((s) => ({ revealedCount: Math.max(0, Math.min(s.transactions.length, index)) })),
    setSpeed: (speed) => {
      const wasPlaying = get().playing;
      clearTick();
      set({ speed, playing: false });
      if (wasPlaying) get().actions.play();
    },

    setDataMode: (mode) => {
      set({ dataMode: mode });
      if (mode === "live" && get().liveStatus === "idle") {
        void get().actions.fetchLive();
      }
    },
    setLiveBaseUrl: (url) => set({ liveBaseUrl: url }),
    fetchLive: async () => {
      set({ liveStatus: "loading", liveError: null });
      try {
        const graph = await fetchLiveGraph(get().liveBaseUrl);
        set({ liveStatus: "ready", liveGraph: graph, liveError: null });
      } catch (error) {
        const message = error instanceof LiveApiError ? error.message : "Unexpected error contacting the backend.";
        set({ liveStatus: "error", liveGraph: null, liveError: message });
      }
    },

    selectAccount: (id) => set({ selectedAccountId: id }),
    selectTransaction: (id) => set({ selectedTransactionId: id }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    toggleRiskFilter: (level) =>
      set((s) => ({
        riskFilter: s.riskFilter.includes(level)
          ? s.riskFilter.filter((l) => l !== level)
          : [...s.riskFilter, level],
      })),
    clearRiskFilter: () => set({ riskFilter: [] }),
    setActiveCase: (id) => set({ activeCaseId: id }),
    setActiveLayout: (layout) => set({ activeLayout: layout }),

    setInvestigationStatus: (accountId, status) =>
      set((s) => ({
        investigationStatus: { ...s.investigationStatus, [accountId]: status },
        activityLog: log(s.activityLog, accountId, "status_change", `Status set to ${status}`),
      })),
    investigate: (accountId) =>
      set((s) => ({
        investigationStatus: { ...s.investigationStatus, [accountId]: "INVESTIGATING" },
        activityLog: log(s.activityLog, accountId, "investigate", "Marked as under investigation"),
      })),
    flag: (accountId) =>
      set((s) => {
        const current = s.simulatedActions[accountId] ?? createSimulatedActionState();
        return {
          simulatedActions: {
            ...s.simulatedActions,
            [accountId]: { ...current, flagged: true, flaggedAt: new Date().toISOString() },
          },
          activityLog: log(s.activityLog, accountId, "flag", "Flagged (simulated -- no real account was changed)"),
        };
      }),
    unflag: (accountId) =>
      set((s) => {
        const current = s.simulatedActions[accountId] ?? createSimulatedActionState();
        return {
          simulatedActions: {
            ...s.simulatedActions,
            [accountId]: { ...current, flagged: false, flaggedAt: null },
          },
          activityLog: log(s.activityLog, accountId, "unflag", "Flag cleared (simulated)"),
        };
      }),
    freeze: (accountId) =>
      set((s) => {
        const current = s.simulatedActions[accountId] ?? createSimulatedActionState();
        return {
          simulatedActions: {
            ...s.simulatedActions,
            [accountId]: { ...current, frozen: true, frozenAt: new Date().toISOString() },
          },
          activityLog: log(s.activityLog, accountId, "freeze", "Frozen (simulated -- no real account was changed)"),
        };
      }),
    unfreeze: (accountId) =>
      set((s) => {
        const current = s.simulatedActions[accountId] ?? createSimulatedActionState();
        return {
          simulatedActions: {
            ...s.simulatedActions,
            [accountId]: { ...current, frozen: false, frozenAt: null },
          },
          activityLog: log(s.activityLog, accountId, "unfreeze", "Freeze lifted (simulated)"),
        };
      }),
    addNote: (accountId, text) =>
      set((s) => {
        const trimmed = text.trim();
        if (!trimmed) return s;
        const note: AnalystNote = { id: newId("NOTE"), accountId, text: trimmed, createdAt: new Date().toISOString() };
        return {
          notes: { ...s.notes, [accountId]: [note, ...(s.notes[accountId] ?? [])] },
          activityLog: log(s.activityLog, accountId, "note", "Added an analyst note"),
        };
      }),
  },
}));

export const useConsoleActions = () => useConsoleStore((s) => s.actions);
