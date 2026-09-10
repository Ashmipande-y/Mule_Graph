import type { Transaction } from "@/types/transaction";
import { validateTransactionForm } from "./transactionValidation";

export const MAX_CASE_TRANSACTIONS = 500;

/** JSON imports use the canonical whole-rupee contract, never AML paise. */
export function parseCustomTransactions(text: string, existing: readonly Transaction[] = []): Transaction[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Enter valid JSON: a transaction array or an object with a transactions array."); }
  const records = Array.isArray(value) ? value : value && typeof value === "object" && "transactions" in value ? value.transactions : null;
  if (!Array.isArray(records) || records.length === 0) throw new Error("Include at least one transaction in the array.");
  if (records.length + existing.length > MAX_CASE_TRANSACTIONS) throw new Error("A custom case can contain up to 500 transactions.");
  const ids = new Set(existing.map((t) => t.id));
  return records.map((record: unknown, index) => {
    const fail = (message: string): never => { throw new Error(`Row ${index + 1}: ${message}`); };
    if (!record || typeof record !== "object" || Array.isArray(record)) return fail("Expected a transaction object.");
    const row = record as Record<string, unknown>;
    for (const field of ["id", "sender", "receiver", "timestamp"] as const) {
      if (typeof row[field] !== "string") fail(`${field} must be a string.`);
    }
    if (typeof row.amount !== "number" || !Number.isSafeInteger(row.amount) || row.amount <= 0) fail("amount must be a positive whole number of INR.");
    const timestamp = row.timestamp as string;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) fail("Use a UTC timestamp such as 2026-09-10T10:00:00Z.");
    const parsed = validateTransactionForm({ id: row.id as string, sender: row.sender as string,
      receiver: row.receiver as string, amount: String(row.amount), date: timestamp.slice(0, -1), timezoneOffsetMinutes: 0 }, { existingIds: ids });
    if (!parsed.transaction) fail(Object.values(parsed.errors).join(" "));
    const transaction = parsed.transaction!;
    if (transaction.timestamp !== timestamp) fail("Enter a real UTC calendar date and time.");
    ids.add(transaction.id);
    return transaction;
  });
}

export function customCaseExample(kind: "suspicious" | "ordinary", prefix: string): Transaction[] {
  const rows: [string, string, number, string][] = kind === "suspicious" ? [
    ["CUSTOMER", "HUB", 100000, "10:00:00"],
    ["HUB", "RELAY_A", 30000, "10:00:04"],
    ["HUB", "RELAY_B", 28000, "10:00:07"],
    ["HUB", "RELAY_C", 32000, "10:00:10"],
    ["RELAY_A", "COLLECTOR", 26000, "10:00:15"],
    ["RELAY_B", "COLLECTOR", 24000, "10:00:18"],
    ["RELAY_C", "COLLECTOR", 28000, "10:00:21"],
  ] : [
    ["EMPLOYER", "PERSON", 45000, "09:00:00"],
    ["PERSON", "RENT", 15000, "12:00:00"],
    ["PERSON", "SHOP", 2500, "16:30:00"],
  ];
  return rows.map(([sender, receiver, amount, time], index) => ({
    id: `${prefix}_TX${index + 1}`, sender: `${prefix}_${sender}`, receiver: `${prefix}_${receiver}`,
    amount, timestamp: `2026-09-10T${time}Z`,
  }));
}
