import { describe, expect, it } from "vitest";
import {
  amlTransactionsEqual,
  emptyAmlFormValues,
  generateNextAmlTransactionId,
  validateAmlForm,
} from "./amlTransactionValidation";

const baseValues = emptyAmlFormValues({
  id: "AML_000001",
  sender: "IBM_HIS_V8:B012:A8049BC300",
  receiver: "IBM_HIS_V8:BNEW:ANEWACCT",
  amountInr: "753279.46",
  date: "2022-09-01T00:05:00",
  timezoneOffsetMinutes: 0,
  paymentFormat: "ACH",
});

describe("validateAmlForm: valid entry", () => {
  it("accepts a valid transaction and converts to exact paise", () => {
    const { errors, transaction } = validateAmlForm(baseValues, { existingIds: new Set() });
    expect(errors).toEqual({});
    expect(transaction).toEqual({
      id: "AML_000001",
      sender: "IBM_HIS_V8:B012:A8049BC300",
      receiver: "IBM_HIS_V8:BNEW:ANEWACCT",
      amountPaise: 75327946,
      currency: "INR",
      timestamp: "2022-09-01T00:05:00Z",
      paymentFormat: "ACH",
    });
  });
});

describe("validateAmlForm: invalid amounts", () => {
  it("rejects more than 2 decimal places", () => {
    const { errors } = validateAmlForm({ ...baseValues, amountInr: "1.234" }, { existingIds: new Set() });
    expect(errors.amountInr).toBeTruthy();
  });

  it("rejects zero and negative", () => {
    expect(validateAmlForm({ ...baseValues, amountInr: "0" }, { existingIds: new Set() }).errors.amountInr).toBeTruthy();
    expect(validateAmlForm({ ...baseValues, amountInr: "-5" }, { existingIds: new Set() }).errors.amountInr).toBeTruthy();
  });

  it("accepts up to 2 decimal places", () => {
    const { transaction } = validateAmlForm({ ...baseValues, amountInr: "29.29" }, { existingIds: new Set() });
    expect(transaction?.amountPaise).toBe(2929);
  });
});

describe("validateAmlForm: duplicate ids and sender/receiver", () => {
  it("rejects a duplicate id", () => {
    const { errors } = validateAmlForm(baseValues, { existingIds: new Set(["AML_000001"]) });
    expect(errors.id).toMatch(/already in use/);
  });

  it("rejects sender === receiver", () => {
    const { errors } = validateAmlForm({ ...baseValues, receiver: baseValues.sender }, { existingIds: new Set() });
    expect(errors.receiver).toBeTruthy();
  });
});

describe("validateAmlForm: timestamp forced to minute precision", () => {
  it("normalizes seconds to :00 regardless of input", () => {
    const { transaction } = validateAmlForm({ ...baseValues, date: "2022-09-01T00:05:30" }, { existingIds: new Set() });
    expect(transaction?.timestamp).toBe("2022-09-01T00:05:00Z");
  });

  it("rejects an invalid calendar date", () => {
    const { errors } = validateAmlForm({ ...baseValues, date: "2022-02-30T00:00:00" }, { existingIds: new Set() });
    expect(errors.date).toBeTruthy();
  });
});

describe("generateNextAmlTransactionId", () => {
  it("continues the AML_NNNNNN sequence", () => {
    expect(generateNextAmlTransactionId(new Set(["AML_000001", "AML_000002"]))).toBe("AML_000003");
  });

  it("starts fresh when nothing exists", () => {
    expect(generateNextAmlTransactionId(new Set())).toBe("AML_000001");
  });
});

describe("amlTransactionsEqual", () => {
  it("detects a changed amount as inequality (assessment result would be stale)", () => {
    const { transaction: a } = validateAmlForm(baseValues, { existingIds: new Set() });
    const { transaction: b } = validateAmlForm({ ...baseValues, amountInr: "1.00" }, { existingIds: new Set() });
    expect(amlTransactionsEqual(a, b)).toBe(false);
  });

  it("treats identical transactions as equal", () => {
    const { transaction: a } = validateAmlForm(baseValues, { existingIds: new Set() });
    const { transaction: b } = validateAmlForm(baseValues, { existingIds: new Set() });
    expect(amlTransactionsEqual(a, b)).toBe(true);
  });
});
