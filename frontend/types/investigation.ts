/**
 * Session-local investigation workflow state. None of this is sent to any
 * backend or persisted beyond this browser session -- it exists so an
 * analyst can work a case inside the demo, not to represent a real case
 * management system.
 */
export type InvestigationStatus = "NEW" | "INVESTIGATING" | "ESCALATED" | "CLOSED";

/**
 * Flag/Freeze are explicitly simulated actions local to this demo session.
 * They never call a real banking system and must always be presented that
 * way in the UI (see the confirmation dialogs in
 * components/investigation/InvestigationActions.tsx).
 */
export interface SimulatedActionState {
  flagged: boolean;
  frozen: boolean;
  flaggedAt: string | null;
  frozenAt: string | null;
}

export function createSimulatedActionState(): SimulatedActionState {
  return { flagged: false, frozen: false, flaggedAt: null, frozenAt: null };
}

export interface AnalystNote {
  id: string;
  accountId: string;
  text: string;
  createdAt: string;
}

export type ActivityType =
  | "investigate"
  | "status_change"
  | "flag"
  | "unflag"
  | "freeze"
  | "unfreeze"
  | "note";

export interface ActivityLogEntry {
  id: string;
  accountId: string;
  type: ActivityType;
  message: string;
  createdAt: string;
}
