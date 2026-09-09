/**
 * Exact INR <-> paise conversion for the AML dataset's `amount_paise`
 * integer-minor-units contract (see backend/docs/aml-integration-contract.md
 * and INTEGRATION_SCHEMA.json). Never uses `Math.round(parseFloat(x) * 100)`
 * -- that can misround values like "0.1" due to binary floating-point
 * representation; this parses the decimal string directly instead.
 */

/**
 * Parses a rupee amount string (up to 2 decimal places) into exact integer
 * paise. Returns null for anything that isn't a valid non-negative decimal
 * with at most 2 fractional digits, or that would overflow a safe integer.
 */
export function inrStringToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const [wholePart, fracPart = ""] = trimmed.split(".");
  const paddedFrac = fracPart.padEnd(2, "0");
  const whole = Number(wholePart);
  const frac = Number(paddedFrac);
  if (!Number.isSafeInteger(whole)) return null;

  const paise = whole * 100 + frac;
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/** Exact paise -> "rupees.paise" display string, e.g. 75327946 -> "753279.46". */
export function paiseToInrString(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const cents = Math.abs(paise % 100);
  return `${rupees}.${String(cents).padStart(2, "0")}`;
}

/** Localized INR display with the rupee sign, e.g. 75327946 -> "₹7,53,279.46". */
export function formatPaiseAsInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
