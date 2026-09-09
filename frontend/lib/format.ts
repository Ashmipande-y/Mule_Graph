const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

/** Compact "HH:MM:SS" UTC form for dense tables/timelines. */
export function formatClockUtc(iso: string): string {
  return iso.slice(11, 19);
}

/** Full "YYYY-MM-DD HH:MM:SS UTC" form for detail views. */
export function formatFullUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function formatScore(score: number | null): string {
  return score === null ? "—" : score.toFixed(4);
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
