import { describe, expect, it } from "vitest";
import { customCaseExample, parseCustomTransactions } from "./customCases";
import { buildGraphSnapshot } from "./graphBuilder";

describe("custom case imports", () => {
  const row = { id: "INPUT_1", sender: "A", receiver: "B", amount: 100, timestamp: "2026-09-10T10:00:00Z" };
  it("accepts arrays and API request objects without changing amounts or timestamps", () => {
    expect(parseCustomTransactions(JSON.stringify([row]))).toEqual([row]);
    expect(parseCustomTransactions(JSON.stringify({ transactions: [row] }))).toEqual([row]);
  });
  it.each([true, "100", 0, -1, 1.5, 9007199254740992])("rejects unsafe or coerced amount %s", (amount) => {
    expect(() => parseCustomTransactions(JSON.stringify([{ ...row, amount }]))).toThrow("positive whole number");
  });
  it.each(["2026-02-30T10:00:00Z", "2026-09-10T10:00:60Z", "2026-09-10T10:00:00+05:30"])("rejects invalid timestamps: %s", (timestamp) => {
    expect(() => parseCustomTransactions(JSON.stringify([{ ...row, timestamp }]))).toThrow();
  });
  it("rejects duplicates in the import or existing draft and identifies the row", () => {
    expect(() => parseCustomTransactions(JSON.stringify([row, row]))).toThrow("Row 2");
    expect(() => parseCustomTransactions(JSON.stringify([row]), [row])).toThrow("already in use");
  });
  it("rejects self-transfers, malformed JSON, empty arrays and too many rows", () => {
    expect(() => parseCustomTransactions(JSON.stringify([{ ...row, receiver: "A" }]))).toThrow("differ");
    expect(() => parseCustomTransactions("[broken")).toThrow("valid JSON");
    expect(() => parseCustomTransactions("[]")).toThrow("at least one");
    expect(() => parseCustomTransactions(JSON.stringify(Array(501).fill(row)))).toThrow("500");
  });
  it("provides distinct examples with and without a supported finding", () => {
    const suspicious = customCaseExample("suspicious", "CASE1");
    expect(buildGraphSnapshot(suspicious).findings[0].score).toBeCloseTo(0.9317, 4);
    expect(buildGraphSnapshot(customCaseExample("ordinary", "CASE2")).findings).toHaveLength(0);
    expect(parseCustomTransactions(JSON.stringify(suspicious))).toEqual(suspicious);
  });
});
