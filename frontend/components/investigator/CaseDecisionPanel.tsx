"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCaseStore } from "@/lib/store/caseStore";
import type { SavedCase, CaseStatus } from "@/lib/services/caseClient";

export function CaseDecisionPanel({ record }: { record: SavedCase }) {
  const [note, setNote] = useState("");
  const busy = useCaseStore((s) => s.busy);
  const update = useCaseStore((s) => s.update);
  async function save(status: CaseStatus) {
    if (await update(record, status, note)) setNote("");
  }
  return (
    <section className="space-y-2 border-b border-border p-3" aria-label="Saved case decisions">
      <p className="text-sm">Case status: <strong data-testid="case-status">{record.status}</strong> · Revision {record.revision}</p>
      <p className="text-xs text-muted-foreground">Saved evidence snapshot · Decisions and notes are stored on the backend.</p>
      <div className="flex gap-2">
        <Textarea aria-label="Case note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={10000} rows={2} placeholder="Record evidence reviewed and next action" />
        <Button disabled={busy || !note.trim()} onClick={() => void save(record.status)}>Save note</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || record.status === "investigating"} onClick={() => void save("investigating")}>{record.status === "closed" ? "Reopen investigation" : "Start investigation"}</Button>
        <Button variant="outline" disabled={busy || record.status === "flagged" || record.status === "closed"} onClick={() => void save("flagged")}>Flag case for review</Button>
        <Button variant="outline" disabled={busy || record.status === "closed"} onClick={() => void save("closed")}>Close case</Button>
      </div>
      <details>
        <summary className="cursor-pointer text-xs">Saved notes and history ({record.history.length})</summary>
        <ul className="max-h-36 overflow-auto text-xs">
          {record.history.map((entry, i) => <li className="py-1" key={i}>{entry.created_at} · {entry.previous_status} → {entry.status}{entry.note && <p>{entry.note}</p>}</li>)}
        </ul>
      </details>
    </section>
  );
}
