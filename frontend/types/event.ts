export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export type EventType =
  | "transaction_committed"
  | "assessment_completed"
  | "case_updated"
  | "resync";

export interface LiveEventEnvelope<T = Record<string, unknown>> {
  event_id: number;
  event_type: EventType;
  timestamp: string;
  workspace_id: string;
  data: T;
}

export interface TransactionCommittedData {
  transaction_id: string;
  sender_masked: string;
  receiver_masked: string;
  amount_paise?: number;
  amount?: number;
  currency?: string;
  timestamp: string;
  payment_format?: string;
}

export interface AssessmentCompletedData {
  assessment_type: string;
  transaction_count: number;
  high_risk_count?: number;
  high_risk_accounts?: number;
  duration_ms: number;
}

export interface CaseUpdatedData {
  case_id: string;
  previous_status: string;
  new_status: string;
  account_ids: string[];
  updated_at: string;
  author: string;
  note?: string;
}
