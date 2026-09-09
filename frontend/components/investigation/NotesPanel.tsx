"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";
import type { AnalystNote } from "@/types/investigation";
import { formatFullUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

// A zustand selector must return a referentially stable value when nothing
// has actually changed -- `s.notes[accountId] ?? []` returns a brand new
// array every call for an account with no notes yet, which (since zustand's
// hook is built on useSyncExternalStore) causes React to treat every
// unrelated store update as "this subscription changed," triggering an
// infinite re-render loop the instant this panel mounts for such an
// account. Reusing one empty array keeps the "no notes" case stable.
const NO_NOTES: AnalystNote[] = [];

export function NotesPanel({ accountId, className }: { accountId: string; className?: string }) {
  const notes = useConsoleStore((s) => s.notes[accountId] ?? NO_NOTES);
  const actions = useConsoleActions();
  const [draft, setDraft] = useState("");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Analyst notes (session-local)
      </h3>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={`Add a note about ${accountId}…`}
        rows={2}
        className="text-sm"
        aria-label={`Add a note about ${accountId}`}
      />
      <Button
        size="sm"
        className="self-end"
        disabled={!draft.trim()}
        onClick={() => {
          actions.addNote(accountId, draft);
          setDraft("");
        }}
      >
        Add note
      </Button>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border border-border bg-panel-3 p-2 text-xs">
              <p className="text-foreground">{note.text}</p>
              <p className="mt-1 font-data text-[0.65rem] text-muted-foreground">{formatFullUtc(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
