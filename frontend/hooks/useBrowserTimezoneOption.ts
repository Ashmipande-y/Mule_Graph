"use client";

import { useSyncExternalStore } from "react";
import type { TimezoneOption } from "@/lib/services/transactionValidation";

function subscribe(): () => void {
  return () => {};
}

// useSyncExternalStore requires getSnapshot to return a referentially
// stable value when nothing has actually changed (React compares via
// Object.is) -- returning a fresh object literal every call, as this used
// to, makes React believe the store changes on every single render,
// causing an infinite render loop ("Maximum update depth exceeded") the
// instant a component using this hook (e.g. TransactionForm) mounts.
// Cached here and only recomputed if the offset itself actually changes
// (e.g. a DST transition while the page is open).
let cachedSnapshot: TimezoneOption | null = null;
let cachedOffsetMinutes: number | null = null;

function getSnapshot(): TimezoneOption {
  const offsetMinutes = -new Date().getTimezoneOffset();
  if (cachedSnapshot === null || cachedOffsetMinutes !== offsetMinutes) {
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hours = String(Math.floor(abs / 60)).padStart(2, "0");
    const minutes = String(abs % 60).padStart(2, "0");
    cachedSnapshot = { label: `Browser local (${sign}${hours}:${minutes})`, offsetMinutes };
    cachedOffsetMinutes = offsetMinutes;
  }
  return cachedSnapshot;
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
