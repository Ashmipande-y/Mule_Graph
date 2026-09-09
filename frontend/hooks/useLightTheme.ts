"use client";

import { useEffect } from "react";

/**
 * Applies the light theme override to the document root, not a local
 * wrapper div. This matters because Radix Dialog/Sheet/Tooltip content is
 * portaled to `document.body` by default -- a `.theme-light` class on a
 * wrapper div inside the page would never reach that portaled content,
 * which would then render dark-themed even while the rest of the page
 * (Enterprise Banking) is light. Applying the class to `<html>` instead
 * puts every descendant, portaled or not, under the same theme scope. Since
 * only one layout is ever mounted at a time (Next.js swaps the whole page
 * on navigation), this is safe as a document-level toggle.
 */
export function useLightTheme(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("theme-light");
    return () => {
      document.documentElement.classList.remove("theme-light");
    };
  }, [enabled]);
}
