import { describe, expect, it } from "vitest";
import { formatPaiseAsInr, inrStringToPaise, paiseToInrString } from "./amlMoney";

describe("inrStringToPaise: exact conversion, no floating-point error", () => {
  it("converts whole rupees", () => {
    expect(inrStringToPaise("100")).toBe(10000);
  });

  it("converts two-decimal amounts exactly", () => {
    expect(inrStringToPaise("753279.46")).toBe(75327946);
    expect(inrStringToPaise("0.01")).toBe(1);
    expect(inrStringToPaise("0.10")).toBe(10);
  });

  it("pads a single decimal digit", () => {
    expect(inrStringToPaise("1.5")).toBe(150);
  });

  it("handles the classic floating-point trap value (0.1 + 0.2 style amounts)", () => {
    // 0.1 rupees is not exactly representable in binary floating point;
    // parseFloat("0.1") * 100 can drift. String-based parsing must not.
    expect(inrStringToPaise("0.1")).toBe(10);
    expect(inrStringToPaise("29.29")).toBe(2929);
  });

  it("rejects more than two decimal places", () => {
    expect(inrStringToPaise("1.234")).toBeNull();
  });

  it("rejects zero, negative, and non-numeric input", () => {
    expect(inrStringToPaise("0")).toBeNull();
    expect(inrStringToPaise("0.00")).toBeNull();
    expect(inrStringToPaise("-5")).toBeNull();
    expect(inrStringToPaise("abc")).toBeNull();
    expect(inrStringToPaise("")).toBeNull();
  });

  it("round-trips through paiseToInrString", () => {
    const paise = inrStringToPaise("753279.46")!;
    expect(paiseToInrString(paise)).toBe("753279.46");
  });
});

describe("formatPaiseAsInr", () => {
  it("formats with the rupee sign and thousands separators", () => {
    expect(formatPaiseAsInr(75327946)).toMatch(/₹.*7,53,279\.46/);
  });
});
