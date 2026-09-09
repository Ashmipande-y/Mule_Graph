"use client";

import { useState } from "react";
import { formatClockUtc, formatINR } from "@/lib/format";
import { labelFor } from "@/lib/services/labels";
import { formatExposureDelta, type InvestigatorScenario } from "@/lib/services/investigatorScenario";
import { cn } from "@/lib/utils";

export function EvidenceTab({ scenario }: { scenario: InvestigatorScenario }) {
  const [policy, setPolicy] = useState<"strict" | "permissive">("strict");
  const { strict, permissive, allTransactions, victimIds, sourceAccountId } = scenario;
  const active = policy === "strict" ? strict : permissive;
  const transactions = allTransactions.filter((tx) => active.transactionIds.includes(tx.id));

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Evidence policy</h3>
        <div className="flex w-fit items-center rounded-md border border-border bg-panel-3 p-0.5 text-xs" role="group">
          <button
            type="button"
            aria-pressed={policy === "strict"}
            onClick={() => setPolicy("strict")}
            className={cn("rounded px-2.5 py-1 font-medium transition-colors", policy === "strict" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Strict
          </button>
          <button
            type="button"
            aria-pressed={policy === "permissive"}
            onClick={() => setPolicy("permissive")}
            className={cn("rounded px-2.5 py-1 font-medium transition-colors", policy === "permissive" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Permissive
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{active.description}</p>
        <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-panel-2 p-2.5 text-xs">
          <div>
            <p className="text-muted-foreground">Exposure under this policy</p>
            <p className="font-data text-base font-semibold text-foreground">{formatINR(active.exposure)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-muted-foreground">Delta vs. the other policy</p>
            <p className="font-data text-foreground">{formatExposureDelta(strict, permissive)}</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Transactions in scope ({transactions.length})
        </h3>
        <ul className="flex flex-col gap-1">
          {transactions.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 font-data text-xs">
              <span className="text-muted-foreground">{formatClockUtc(tx.timestamp)}</span>
              <span className="text-foreground">{tx.id}</span>
              <span className="text-muted-foreground">{tx.sender} → {tx.receiver}</span>
              <span className="text-foreground">{formatINR(tx.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-2.5 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground">
            Control-cohort audit — why other accounts weren&apos;t flagged
          </summary>
          <div className="border-t border-border p-2.5 text-xs text-muted-foreground">
            {victimIds.length > 0 ? (
              <p>
                {victimIds.map(labelFor).join(", ")} sent funds into {sourceAccountId ? labelFor(sourceAccountId) : "the source account"}{" "}
                but appears in no fan-out/convergence finding — it is reported <span className="font-medium text-foreground">UNASSESSED</span>,
                not cleared. Absence of evidence is not evidence of absence: this account simply never matched the detector&apos;s pattern in the
                observed window, which is a different claim from &quot;verified safe.&quot;
              </p>
            ) : (
              <p>No other accounts are present in this dataset to audit as a control cohort.</p>
            )}
            <p className="mt-2">
              This canonical demo has only six accounts total, all either part of the one detected network or the victim above — a real
              control-cohort comparison (legitimate high-volume accounts that structurally resemble the flagged pattern but weren&apos;t flagged)
              would need a larger account population than this fixture provides.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
