import type { ApiFinding, ApiGraphResponse } from "@/types/api";
import type { Finding } from "@/types/finding";
import type { Transaction } from "@/types/transaction";

export type CaseStatus = "new" | "investigating" | "flagged" | "closed";
export interface SavedCase {
  case_id: string;
  workspace_id: string;
  title: string;
  status: CaseStatus;
  revision: number;
  finding: ApiFinding;
  graph: ApiGraphResponse;
  transactions: Transaction[];
  notes: { id: string; author: string; text: string; created_at: string }[];
  history: { previous_status: CaseStatus; status: CaseStatus; author: string; note: string | null; created_at: string }[];
  created_at: string;
  updated_at: string;
}

async function request<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/cases${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.detail === "string" ? payload.detail : `Case request failed (HTTP ${response.status}).`);
  }
  return response.json();
}

export const listSavedCases = (baseUrl: string) => request<SavedCase[]>(baseUrl, "");
export const openEvidenceCase = (baseUrl: string, transactions: Transaction[], finding: Finding) =>
  request<SavedCase>(baseUrl, "", {
    transactions, source_account: finding.sourceAccount, collector_account: finding.collectorAccount,
    intermediary_accounts: finding.intermediaryAccounts,
  });
export const updateSavedCase = (baseUrl: string, record: SavedCase, status: CaseStatus, note?: string) =>
  request<SavedCase>(baseUrl, `/${encodeURIComponent(record.case_id)}/status`, {
    status, expected_revision: record.revision, note: note?.trim() || undefined,
  });
