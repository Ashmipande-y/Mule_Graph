"use client";

import { useSyncExternalStore } from "react";
import type { TimezoneOption } from "@/lib/services/transactionValidation";

function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): TimezoneOption {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return { label: `Browser local (${sign}${hours}:${minutes})`, offsetMinutes };
}

function getServerSnapshot(): TimezoneOption | null {
  return null;
}

/**
 * The server has no meaningful notion of "the browser's timezone," so this
 * reads it via useSyncExternalStore rather than an effect + setState: React
 * renders the server snapshot (null) first and swaps to the real client
 * snapshot right after hydration, without the extra render pass an
 * effect-based approach would need and without ever mismatching SSR output.
 */
export function useBrowserTimezoneOption(): TimezoneOption | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
