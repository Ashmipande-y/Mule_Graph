"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatFullUtc, formatINR } from "@/lib/format";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";
import type { SavedCase } from "@/lib/services/caseClient";

/**
 * "Export case evidence" -- deliberately not called a SAR (Suspicious
 * Activity Report). A SAR is a real regulatory filing with legal
 * consequences; labeling a demo export that way would misrepresent what
 * this button actually does. This downloads exactly the real, already-
 * computed evidence shown elsewhere in the workspace, as JSON.
 */
export function ReportsTab({ scenario, savedCase }: { scenario: InvestigatorScenario; savedCase?: SavedCase }) {
  const [notes, setNotes] = useState("");
  const [checkedEvidence, setCheckedEvidence] = useState<Set<string>>(new Set());
  const { finding, flaggedAccountId, flaggedAccountLabel, strict, permissive, accountRisk } = scenario;

  if (!finding || !flaggedAccountId) {
    return <p className="p-3 text-sm text-muted-foreground">No case detected in the current dataset.</p>;
  }

  function toggleEvidence(id: string) {
    setCheckedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadEvidence() {
    const payload = {
      exported_at: new Date().toISOString(),
      case_account: flaggedAccountId,
      finding,
      strict_policy: strict,
      permissive_policy: permissive,
      account_risk: Object.fromEntries(accountRisk),
      investigator_confirmed_evidence: [...checkedEvidence],
      investigator_notes: notes,
      saved_case: savedCase ?? null,
      transactions: scenario.allTransactions,
      disclaimer:
        "MuleGraph evidence export, not a regulatory filing. Evidence score is a heuristic ranking, not a calibrated fraud probability.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mulegraph-case-${flaggedAccountId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Case audit trail</h3>
        <p className="text-xs text-muted-foreground">
          {flaggedAccountLabel} ({flaggedAccountId}) — fan_out_convergence, evidence score {finding.score.toFixed(4)}, window{" "}
          {formatFullUtc(finding.windowStart)} → {formatFullUtc(finding.windowEnd)}. Linked exposure (strict):{" "}
          {formatINR(strict.exposure)}.
        </p>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Confirm evidence reviewed ({checkedEvidence.size}/{strict.transactionIds.length})
        </h3>
        <ul className="flex flex-col gap-1">
          {strict.transactionIds.map((id) => (
            <li key={id}>
              <label className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                <input type="checkbox" checked={checkedEvidence.has(id)} onChange={() => toggleEvidence(id)} />
                <span className="font-data">{id}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Label htmlFor="investigator-notes" className="text-xs text-muted-foreground">
          Additional export notes (draft only; use Save note above for the case record)
        </Label>
        <Textarea
          id="investigator-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-1 text-sm"
          placeholder="Record your assessment and next action…"
        />
      </section>

      <Button onClick={downloadEvidence} className="w-fit">
        <Download className="size-3.5" />
        Export case evidence (JSON)
      </Button>
      <p className="text-[0.65rem] text-muted-foreground">
        Demo export of the real evidence shown in this workspace — not a Suspicious Activity Report or any regulatory
        filing.
      </p>
    </div>
  );
}
