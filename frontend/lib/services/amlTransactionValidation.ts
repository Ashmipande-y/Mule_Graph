import type { AmlPaymentFormat, AmlTransaction } from "@/types/aml";
import { inrStringToPaise } from "./amlMoney";
import { BASE_TIMEZONE_OPTIONS, localDateTimeToUtcIso } from "./transactionValidation";

export { BASE_TIMEZONE_OPTIONS };

export const PAYMENT_FORMATS: AmlPaymentFormat[] = ["ACH", "Wire"];

export interface AmlFormValues {
  id: string;
  sender: string;
  receiver: string;
  amountInr: string; // decimal string, up to 2 places
  date: string; // datetime-local value
  timezoneOffsetMinutes: number;
  paymentFormat: AmlPaymentFormat;
}

export function emptyAmlFormValues(defaults: Partial<AmlFormValues> = {}): AmlFormValues {
  return {
    id: "",
    sender: "",
    receiver: "",
    amountInr: "",
    date: "",
    timezoneOffsetMinutes: 0,
    paymentFormat: "ACH",
    ...defaults,
  };
}

export interface AmlFormErrors {
  id?: string;
  sender?: string;
  receiver?: string;
  amountInr?: string;
  date?: string;
  paymentFormat?: string;
}

const TX_ID_PATTERN = /^AML_(\d+)$/;

export function generateNextAmlTransactionId(existingIds: ReadonlySet<string>): string {
  let max = 0;
  for (const id of existingIds) {
    const match = TX_ID_PATTERN.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `AML_${String(max + 1).padStart(6, "0")}`;
}

/**
 * Normalizes a `datetime-local` value + timezone offset to the AML
 * dataset's own minute-precision form (seconds forced to "00", matching the
 * source data's actual resolution) rather than the canonical demo's
 * second-precision contract. Rejects (does not floor) a value with a
 * nonzero seconds component if the caller entered one via a browser that
 * allows seconds input.
 */
function toMinutePrecisionUtcIso(dateTimeLocal: string, offsetMinutes: number): string | null {
  const iso = localDateTimeToUtcIso(dateTimeLocal, offsetMinutes);
  if (!iso) return null;
  return iso.replace(/:\d{2}Z$/, ":00Z");
}

export interface ValidateAmlOptions {
  existingIds: ReadonlySet<string>;
}

export interface ValidateAmlResult {
  errors: AmlFormErrors;
  transaction: AmlTransaction | null;
}

export function validateAmlForm(values: AmlFormValues, options: ValidateAmlOptions): ValidateAmlResult {
  const errors: AmlFormErrors = {};

  const id = values.id.trim();
  if (!id) {
    errors.id = "Transaction ID is required.";
  } else if (options.existingIds.has(id)) {
    errors.id = `Transaction ID "${id}" is already in use.`;
  }

  const sender = values.sender.trim();
  if (!sender) errors.sender = "Sender account is required.";

  const receiver = values.receiver.trim();
  if (!receiver) {
    errors.receiver = "Receiver account is required.";
  } else if (sender && receiver === sender) {
    errors.receiver = "Receiver must differ from sender.";
  }

  let amountPaise: number | null = null;
  const amountText = values.amountInr.trim();
  if (!amountText) {
    errors.amountInr = "Amount is required.";
  } else {
    amountPaise = inrStringToPaise(amountText);
    if (amountPaise === null) {
      errors.amountInr = "Amount must be a positive number with at most 2 decimal places.";
    }
  }

  let timestamp: string | null = null;
  if (!values.date) {
    errors.date = "Date and time are required.";
  } else {
    timestamp = toMinutePrecisionUtcIso(values.date, values.timezoneOffsetMinutes);
    if (!timestamp) errors.date = "Enter a valid date and time (check the calendar date is real).";
  }

  if (!PAYMENT_FORMATS.includes(values.paymentFormat)) {
    errors.paymentFormat = "Select a supported payment format.";
  }

  if (Object.keys(errors).length > 0 || amountPaise === null || timestamp === null) {
    return { errors, transaction: null };
  }

  return {
    errors,
    transaction: {
      id,
      sender,
      receiver,
      amountPaise,
      currency: "INR",
      timestamp,
      paymentFormat: values.paymentFormat,
    },
  };
}

export function amlTransactionsEqual(a: AmlTransaction | null, b: AmlTransaction | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    a.sender === b.sender &&
    a.receiver === b.receiver &&
    a.amountPaise === b.amountPaise &&
    a.timestamp === b.timestamp &&
    a.paymentFormat === b.paymentFormat
  );
}
