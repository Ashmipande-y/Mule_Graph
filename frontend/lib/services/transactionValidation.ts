import type { Transaction } from "@/types/transaction";

export interface TimezoneOption {
  label: string;
  offsetMinutes: number;
}

/**
 * Fixed, explicit timezone choices rather than a full IANA database: this
 * is a demo entry form for a fixed India-focused UPI scenario, not a
 * general-purpose scheduler. "Browser local" is added at runtime (see
 * useBrowserTimezoneOption) once mounted, since the browser's offset isn't
 * knowable during server rendering without risking a hydration mismatch.
 */
export const BASE_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { label: "UTC (+00:00)", offsetMinutes: 0 },
  { label: "India Standard Time (+05:30)", offsetMinutes: 330 },
];

export interface TransactionFormValues {
  id: string;
  sender: string;
  receiver: string;
  amount: string;
  date: string;
  timezoneOffsetMinutes: number;
}

export function emptyFormValues(defaults: Partial<TransactionFormValues> = {}): TransactionFormValues {
  return {
    id: "",
    sender: "",
    receiver: "",
    amount: "",
    date: "",
    timezoneOffsetMinutes: 0,
    ...defaults,
  };
}

export interface TransactionFormErrors {
  id?: string;
  sender?: string;
  receiver?: string;
  amount?: string;
  date?: string;
}

const TX_ID_PATTERN = /^TX_(\d+)$/;

/** Next unused "TX_NNN"-style id, given every id already in scope (pending + current network). */
export function generateNextTransactionId(existingIds: ReadonlySet<string>): string {
  let max = 0;
  for (const id of existingIds) {
    const match = TX_ID_PATTERN.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = max + 1;
  return `TX_${String(next).padStart(3, "0")}`;
}

/**
 * Converts a `datetime-local` input value (wall-clock, no timezone of its
 * own) plus an explicit UTC offset into the canonical
 * `YYYY-MM-DDTHH:MM:SSZ` form the backend/ml layer requires. Returns null
 * for an unparseable or calendar-invalid date (e.g. 2026-02-30).
 */
export function localDateTimeToUtcIso(dateTimeLocal: string, offsetMinutes: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(dateTimeLocal);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;

  const asUtcCalendarCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const isValidCalendarDate =
    asUtcCalendarCheck.getUTCFullYear() === year &&
    asUtcCalendarCheck.getUTCMonth() === month - 1 &&
    asUtcCalendarCheck.getUTCDate() === day &&
    asUtcCalendarCheck.getUTCHours() === hour &&
    asUtcCalendarCheck.getUTCMinutes() === minute;
  if (!isValidCalendarDate) return null;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface ValidateTransactionOptions {
  /** IDs already in use elsewhere (pending list + current network), excluding the transaction being edited, if any. */
  existingIds: ReadonlySet<string>;
}

export interface ValidateTransactionResult {
  errors: TransactionFormErrors;
  transaction: Transaction | null;
}

/**
 * Validates one transaction entry against the same rules the backend and
 * ml/rules enforce: required account IDs, sender != receiver, positive
 * whole-number INR amount, unique id, and a valid calendar timestamp
 * normalized to UTC second precision.
 */
export function validateTransactionForm(
  values: TransactionFormValues,
  options: ValidateTransactionOptions,
): ValidateTransactionResult {
  const errors: TransactionFormErrors = {};

  const id = values.id.trim();
  if (!id) {
    errors.id = "Transaction ID is required.";
  } else if (options.existingIds.has(id)) {
    errors.id = `Transaction ID "${id}" is already in use.`;
  }

  const sender = values.sender.trim();
  if (!sender) errors.sender = "Sender account ID is required.";

  const receiver = values.receiver.trim();
  if (!receiver) {
    errors.receiver = "Receiver account ID is required.";
  } else if (sender && receiver === sender) {
    errors.receiver = "Receiver must differ from sender.";
  }

  let amount: number | null = null;
  const amountText = values.amount.trim();
  if (!amountText) {
    errors.amount = "Amount is required.";
  } else if (!/^\d+$/.test(amountText)) {
    errors.amount = "Amount must be a positive whole number of INR (no decimals or symbols).";
  } else {
    const parsed = Number(amountText);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      errors.amount = "Amount must be a positive whole number of INR.";
    } else {
      amount = parsed;
    }
  }

  let timestamp: string | null = null;
  if (!values.date) {
    errors.date = "Date and time are required.";
  } else {
    timestamp = localDateTimeToUtcIso(values.date, values.timezoneOffsetMinutes);
    if (!timestamp) errors.date = "Enter a valid date and time (check the calendar date is real).";
  }

  if (Object.keys(errors).length > 0 || amount === null || timestamp === null) {
    return { errors, transaction: null };
  }

  return { errors, transaction: { id, sender, receiver, amount, timestamp } };
}

/**
 * A sensible default for a new transaction's date/time: shortly after the
 * latest known timestamp in scope, in UTC. Returns null when there's
 * nothing to anchor to (an empty network/pending set), leaving the field
 * blank rather than defaulting to an arbitrary time.
 */
export function suggestNextDateTimeLocal(latestKnownIso: string | null, afterSeconds = 30): string | null {
  if (!latestKnownIso) return null;
  const latestMs = Date.parse(latestKnownIso);
  if (Number.isNaN(latestMs)) return null;
  return utcIsoToDateTimeLocal(new Date(latestMs + afterSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
}

/**
 * Reverses localDateTimeToUtcIso for the UTC (0-offset) case: since every
 * stored timestamp is already UTC, editing always round-trips through UTC
 * regardless of what timezone was originally used to create it.
 */
export function utcIsoToDateTimeLocal(iso: string): string {
  return iso.replace(/Z$/, "");
}

/** Order-independent content equality, used to detect whether a completed assessment is now stale. */
export function transactionSetsEqual(a: readonly Transaction[], b: readonly Transaction[]): boolean {
  if (a.length !== b.length) return false;
  const normalize = (list: readonly Transaction[]) =>
    [...list]
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
      .map((t) => `${t.id}|${t.sender}|${t.receiver}|${t.amount}|${t.timestamp}`)
      .join("\n");
  return normalize(a) === normalize(b);
}
