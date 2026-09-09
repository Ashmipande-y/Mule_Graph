import { describe, expect, it } from "vitest";
import {
  BASE_TIMEZONE_OPTIONS,
  emptyFormValues,
  generateNextTransactionId,
  localDateTimeToUtcIso,
  suggestNextDateTimeLocal,
  transactionSetsEqual,
  utcIsoToDateTimeLocal,
  validateTransactionForm,
  withBrowserTimezone,
} from "./transactionValidation";

describe("withBrowserTimezone", () => {
  it("appends the browser-detected timezone when its offset is not already listed", () => {
    const result = withBrowserTimezone(BASE_TIMEZONE_OPTIONS, { label: "Browser local (-08:00)", offsetMinutes: -480 });
    expect(result).toEqual([...BASE_TIMEZONE_OPTIONS, { label: "Browser local (-08:00)", offsetMinutes: -480 }]);
  });

  it("does not add a second option sharing an offset already in the base list", () => {
    // A machine set to IST reports the same +05:30 offset as the built-in
    // "India Standard Time" entry -- two options with the same underlying
    // value break Radix Select's internal by-value item tracking.
    const result = withBrowserTimezone(BASE_TIMEZONE_OPTIONS, { label: "Browser local (+05:30)", offsetMinutes: 330 });
    expect(result).toEqual(BASE_TIMEZONE_OPTIONS);
    expect(result.filter((option) => option.offsetMinutes === 330)).toHaveLength(1);
  });

  it("returns the base list unchanged when there is no browser-detected option", () => {
    expect(withBrowserTimezone(BASE_TIMEZONE_OPTIONS, null)).toEqual(BASE_TIMEZONE_OPTIONS);
  });
});

describe("validateTransactionForm: valid entry", () => {
  it("accepts a fully valid transaction and normalizes the timestamp to UTC", () => {
    const { errors, transaction } = validateTransactionForm(
      {
        id: "TX_008",
        sender: "ACC_A",
        receiver: "ACC_NEW",
        amount: "25000",
        date: "2026-01-01T15:30:00", // 15:30 IST
        timezoneOffsetMinutes: 330,
      },
      { existingIds: new Set(["TX_001", "TX_002"]) },
    );
    expect(errors).toEqual({});
    expect(transaction).toEqual({
      id: "TX_008",
      sender: "ACC_A",
      receiver: "ACC_NEW",
      amount: 25000,
      timestamp: "2026-01-01T10:00:00Z",
    });
  });
});

describe("validateTransactionForm: invalid amounts", () => {
  const base = { id: "TX_009", sender: "ACC_A", receiver: "ACC_B", date: "2026-01-01T10:00:00", timezoneOffsetMinutes: 0 };
  const ids = new Set<string>();

  it("rejects an empty amount", () => {
    const { errors, transaction } = validateTransactionForm({ ...base, amount: "" }, { existingIds: ids });
    expect(errors.amount).toBeTruthy();
    expect(transaction).toBeNull();
  });

  it("rejects a decimal amount", () => {
    const { errors, transaction } = validateTransactionForm({ ...base, amount: "100.50" }, { existingIds: ids });
    expect(errors.amount).toBeTruthy();
    expect(transaction).toBeNull();
  });

  it("rejects a negative amount", () => {
    const { errors, transaction } = validateTransactionForm({ ...base, amount: "-500" }, { existingIds: ids });
    expect(errors.amount).toBeTruthy();
    expect(transaction).toBeNull();
  });

  it("rejects zero", () => {
    const { errors, transaction } = validateTransactionForm({ ...base, amount: "0" }, { existingIds: ids });
    expect(errors.amount).toBeTruthy();
    expect(transaction).toBeNull();
  });

  it("accepts a positive whole number", () => {
    const { errors, transaction } = validateTransactionForm({ ...base, amount: "1" }, { existingIds: ids });
    expect(errors.amount).toBeUndefined();
    expect(transaction?.amount).toBe(1);
  });
});

describe("validateTransactionForm: invalid timestamps", () => {
  const base = { id: "TX_010", sender: "ACC_A", receiver: "ACC_B", amount: "100", timezoneOffsetMinutes: 0 };
  const ids = new Set<string>();

  it("rejects a missing date", () => {
    const { errors } = validateTransactionForm({ ...base, date: "" }, { existingIds: ids });
    expect(errors.date).toBeTruthy();
  });

  it("rejects an invalid calendar date (Feb 30)", () => {
    const { errors, transaction } = validateTransactionForm({ ...base, date: "2026-02-30T10:00:00" }, { existingIds: ids });
    expect(errors.date).toBeTruthy();
    expect(transaction).toBeNull();
  });

  it("rejects a malformed date string", () => {
    const { errors } = validateTransactionForm({ ...base, date: "not-a-date" }, { existingIds: ids });
    expect(errors.date).toBeTruthy();
  });
});

describe("validateTransactionForm: required fields and sender/receiver", () => {
  const validRest = { amount: "100", date: "2026-01-01T10:00:00", timezoneOffsetMinutes: 0 };
  const ids = new Set<string>();

  it("requires sender and receiver", () => {
    const { errors } = validateTransactionForm({ id: "TX_011", sender: "", receiver: "", ...validRest }, { existingIds: ids });
    expect(errors.sender).toBeTruthy();
    expect(errors.receiver).toBeTruthy();
  });

  it("rejects sender === receiver", () => {
    const { errors, transaction } = validateTransactionForm(
      { id: "TX_012", sender: "ACC_A", receiver: "ACC_A", ...validRest },
      { existingIds: ids },
    );
    expect(errors.receiver).toBeTruthy();
    expect(transaction).toBeNull();
  });
});

describe("validateTransactionForm: duplicate transaction IDs", () => {
  it("rejects an id already in use", () => {
    const { errors, transaction } = validateTransactionForm(
      { id: "TX_001", sender: "ACC_A", receiver: "ACC_B", amount: "100", date: "2026-01-01T10:00:00", timezoneOffsetMinutes: 0 },
      { existingIds: new Set(["TX_001"]) },
    );
    expect(errors.id).toMatch(/already in use/);
    expect(transaction).toBeNull();
  });

  it("keeps entered values available on failure (the caller owns form state, not this pure function)", () => {
    const values = emptyFormValues({ id: "TX_001", sender: "ACC_A" });
    validateTransactionForm(values, { existingIds: new Set(["TX_001"]) });
    // The validator never mutates its input -- the caller's state (a React
    // component's useState) is what actually persists entered values.
    expect(values.id).toBe("TX_001");
    expect(values.sender).toBe("ACC_A");
  });
});

describe("generateNextTransactionId", () => {
  it("continues the TX_NNN sequence from the highest existing id", () => {
    expect(generateNextTransactionId(new Set(["TX_001", "TX_002", "TX_007"]))).toBe("TX_008");
  });

  it("starts at TX_001 when nothing exists", () => {
    expect(generateNextTransactionId(new Set())).toBe("TX_001");
  });

  it("ignores non-matching ids", () => {
    expect(generateNextTransactionId(new Set(["CUSTOM_ID", "TX_003"]))).toBe("TX_004");
  });
});

describe("localDateTimeToUtcIso / utcIsoToDateTimeLocal round-trip", () => {
  it("round-trips through UTC", () => {
    const iso = localDateTimeToUtcIso("2026-01-01T10:00:00", 0);
    expect(iso).toBe("2026-01-01T10:00:00Z");
    expect(utcIsoToDateTimeLocal(iso!)).toBe("2026-01-01T10:00:00");
  });

  it("applies a non-zero offset correctly (IST, +05:30)", () => {
    expect(localDateTimeToUtcIso("2026-01-01T15:30:00", 330)).toBe("2026-01-01T10:00:00Z");
  });
});

describe("suggestNextDateTimeLocal", () => {
  it("defaults to 30 seconds after the latest known timestamp, in UTC", () => {
    expect(suggestNextDateTimeLocal("2026-01-01T10:00:21Z")).toBe("2026-01-01T10:00:51");
  });

  it("returns null with nothing to anchor to, rather than an arbitrary time", () => {
    expect(suggestNextDateTimeLocal(null)).toBeNull();
  });

  it("returns null for an unparseable anchor", () => {
    expect(suggestNextDateTimeLocal("not-a-timestamp")).toBeNull();
  });
});

describe("transactionSetsEqual", () => {
  const a = [{ id: "TX_001", sender: "A", receiver: "B", amount: 100, timestamp: "2026-01-01T10:00:00Z" }];
  const b = [{ id: "TX_001", sender: "A", receiver: "B", amount: 100, timestamp: "2026-01-01T10:00:00Z" }];

  it("treats identical sets as equal regardless of order", () => {
    expect(transactionSetsEqual(a, [...b])).toBe(true);
    expect(transactionSetsEqual([...a, ...b].slice(0, 1), b)).toBe(true);
  });

  it("detects a changed amount as inequality (assessment result would be stale)", () => {
    const changed = [{ ...b[0], amount: 200 }];
    expect(transactionSetsEqual(a, changed)).toBe(false);
  });

  it("detects an added transaction as inequality", () => {
    const extended = [...a, { id: "TX_002", sender: "B", receiver: "C", amount: 50, timestamp: "2026-01-01T10:05:00Z" }];
    expect(transactionSetsEqual(a, extended)).toBe(false);
  });
});
