"use client";

import { useEffect } from "react";

type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

/**
 * Registers window-level single-key shortcuts, ignoring keystrokes typed
 * into inputs/textareas/contenteditable so shortcuts never fight with text
 * entry (e.g. typing "f" into search must not trigger a "flag" shortcut).
 */
export function useKeyboardShortcuts(map: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const handler = map[event.key.toLowerCase()];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, map]);
}
