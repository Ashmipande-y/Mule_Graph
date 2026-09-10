"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileJson, Loader2, Network, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BackendUrlEditor } from "@/components/layouts/BackendUrlEditor";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { AssessmentResultPanel } from "@/components/investigation/AssessmentResultPanel";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { GraphAccessibleList } from "@/components/graph/GraphAccessibleList";
import { useCustomCaseStore } from "@/lib/store/customCaseStore";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { useAssessmentStore } from "@/lib/store/assessmentStore";
import { useCaseStore } from "@/lib/store/caseStore";
import { buildAssessedGraphSnapshot } from "@/lib/services/assessmentGraph";
import { customCaseExample, MAX_CASE_TRANSACTIONS, parseCustomTransactions } from "@/lib/services/customCases";
import { formatINR } from "@/lib/format";
import type { Transaction } from "@/types/transaction";
import type { Finding } from "@/types/finding";
import type { GraphSnapshot } from "@/types/graph";

export function CustomCasesView() {
  const router = useRouter();
  const draft = useCustomCaseStore();
  const baseUrl = useConsoleStore((s) => s.liveBaseUrl);
  const saving = useCaseStore((s) => s.busy);
  const saveError = useCaseStore((s) => s.error);
  const [form, setForm] = useState<"add" | Transaction | null>(null);
  const [json, setJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const result = draft.resultBaseUrl === baseUrl ? draft.result : null;
  const busy = draft.busy || saving;
  const accountIds = useMemo(() => [...new Set(draft.transactions.flatMap((t) => [t.sender, t.receiver]))].sort(), [draft.transactions]);
  const ids = useMemo(() => new Set(draft.transactions.map((t) => t.id)), [draft.transactions]);
  const graph = useMemo<GraphSnapshot>(() => result ? buildAssessedGraphSnapshot(result) : ({
    nodes: accountIds.map((id) => ({ id, label: id, riskScore: null, riskLevel: "UNASSESSED" })),
    edges: draft.transactions.map((t) => ({ id: t.id, source: t.sender, target: t.receiver, amount: t.amount, timestamp: t.timestamp })),
  }), [result, accountIds, draft.transactions]);

  function replace(transactions: Transaction[]) {
    draft.setTransactions(transactions);
    setImportError(null);
    setAttemptedSave(false);
    setSelectedAccount(null);
  }

  function addExample(kind: "suspicious" | "ordinary") {
    let number = 1;
    while (draft.transactions.some((t) => t.id.startsWith(`CASE${number}_`))) number++;
    const example = customCaseExample(kind, `CASE${number}`);
    if (example.length + draft.transactions.length > MAX_CASE_TRANSACTIONS) {
      setImportError("A custom case can contain up to 500 transactions.");
      return;
    }
    replace([...draft.transactions, ...example]);
    setForm(null);
  }

  function importTransactions() {
    try {
      const imported = parseCustomTransactions(json, draft.transactions);
      replace([...draft.transactions, ...imported]);
      setJson("");
      setForm(null);
    } catch (error) { setImportError(error instanceof Error ? error.message : "Could not read these transactions."); }
  }

  function viewGraph() {
    if (!result) return;
    useAssessmentStore.getState().actions.activateResult(result);
    useConsoleStore.getState().actions.selectAccount(null);
    router.push("/");
  }

  async function saveFinding(finding: Finding) {
    if (!result || busy) return;
    setAttemptedSave(true);
    const cases = useCaseStore.getState();
    cases.configure(baseUrl);
    if (await cases.open(result.transactions, finding)) {
      useAssessmentStore.getState().actions.activateResult(result);
      router.push("/investigator");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div><h1 className="text-lg font-semibold">Custom Cases</h1><p className="text-sm text-muted-foreground">Build a transaction network and investigate how the funds move.</p></div>
        <BackendUrlEditor />
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[ ["1", "Add transactions", "Enter transfers or paste your network as JSON."], ["2", "Run assessment", "Check the network for suspicious transfer patterns."], ["3", "Investigate", "Open the graph or save a supported finding."] ].map(([step, title, description]) => (
              <div key={step} className="flex gap-3 rounded-lg border border-border bg-panel p-4"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold">{step}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></div>
            ))}
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="min-w-0 space-y-4 rounded-lg border border-border bg-panel p-4" aria-label="Custom case input">
              <div><h2 className="font-semibold">Transaction input</h2><p className="mt-1 text-xs text-muted-foreground">Amounts in whole INR. Each transaction needs a unique ID, two accounts, and a date and time.</p></div>
              <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-60">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => addExample("suspicious")}>Add suspicious example</Button>
                  <Button variant="outline" size="sm" onClick={() => addExample("ordinary")}>Add ordinary example</Button>
                </div>
                <details className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium"><FileJson className="mr-2 inline size-4" />Paste transactions as JSON</summary>
                  <p className="my-2 text-xs text-muted-foreground">Paste an array, or an object with a transactions array. Imported rows are added to this draft.</p>
                  <Textarea aria-label="Transaction JSON" value={json} onChange={(e) => { setJson(e.target.value); setImportError(null); }} className="min-h-40 font-mono text-xs" placeholder={'[{"id":"TX_1","sender":"ACCOUNT_A","receiver":"ACCOUNT_B","amount":10000,"timestamp":"2026-09-10T10:00:00Z"}]'} />
                  <Button size="sm" className="mt-2" disabled={!json.trim()} onClick={importTransactions}>Import transactions</Button>
                </details>
                {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Draft transactions ({draft.transactions.length})</h3>
                  <Button size="sm" disabled={draft.transactions.length >= MAX_CASE_TRANSACTIONS} onClick={() => setForm("add")}><Plus />Add transaction</Button>
                </div>
                {form && <div className="rounded-md border border-border bg-background p-3"><TransactionForm key={form === "add" ? `add:${draft.revision}` : `edit:${form.id}`} mode={form === "add" ? "add" : "edit"} initialTransaction={form === "add" ? null : form} idsInUse={ids} existingAccountIds={accountIds} suggestedTimestamp={draft.transactions.length ? [...draft.transactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].timestamp : null} onCancel={() => setForm(null)} onSubmit={(transaction) => {
                  replace(form === "add" ? [...draft.transactions, transaction] : draft.transactions.map((t) => t.id === form.id ? transaction : t));
                  setForm(null);
                }} /></div>}
                {draft.transactions.length === 0 ? <div className="rounded-md border border-dashed border-border px-4 py-8 text-center"><Network className="mx-auto mb-2 size-7 text-muted-foreground" /><p className="text-sm">Your network starts here</p><p className="mt-1 text-xs text-muted-foreground">Add your first transfer or try an example above.</p></div> : (
                  <div className="max-h-96 overflow-auto rounded-md border border-border"><table className="w-full text-left text-xs"><caption className="sr-only">Custom case transactions</caption><thead className="sticky top-0 bg-panel-2"><tr>{["ID / UTC time", "Transfer", "Amount", "Actions"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{draft.transactions.map((t) => <tr key={t.id} className="border-t border-border"><td className="px-3 py-2 font-mono">{t.id}<span className="mt-1 block whitespace-nowrap text-[10px] text-muted-foreground">{t.timestamp}</span></td><td className="max-w-48 break-all px-3 py-2">{t.sender}<span className="block text-muted-foreground">→ {t.receiver}</span></td><td className="whitespace-nowrap px-3 py-2">{formatINR(t.amount)}</td><td className="px-2 py-2"><div className="flex gap-1"><Button variant="ghost" size="sm" aria-label={`Edit ${t.id}`} onClick={() => setForm(t)}>Edit</Button><Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.id}`} onClick={() => { replace(draft.transactions.filter((item) => item.id !== t.id)); setForm(null); }}><Trash2 className="size-3.5" /></Button></div></td></tr>)}</tbody></table></div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><span className="text-xs text-muted-foreground">{accountIds.length} accounts · {draft.transactions.length} / 500 transfers</span><Button disabled={draft.transactions.length === 0 || form !== null} onClick={() => { setAttemptedSave(false); void draft.assess(baseUrl); }}>{draft.busy ? <Loader2 className="animate-spin" /> : <Network />}{draft.busy ? "Assessing…" : "Run assessment"}</Button></div>
              </fieldset>
              <p className="text-xs text-muted-foreground">This draft stays available while navigating the app. Save a finding to keep its evidence after a page reload.</p>
              {draft.error && <p role="alert" className="text-sm text-destructive">{draft.error}</p>}
            </section>
            <section className="min-w-0 space-y-4" aria-label="Custom case results">
              <div className="overflow-hidden rounded-lg border border-border bg-panel"><div className="flex items-center justify-between border-b border-border p-4"><h2 className="font-semibold">Network preview</h2><span className="text-xs text-muted-foreground">{result ? "Assessed" : "Not assessed"}</span></div><div className="relative h-72">{graph.nodes.length ? <GraphCanvas graph={graph} selectedAccountId={selectedAccount} onSelectAccount={setSelectedAccount} className="absolute inset-0" /> : <div className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">Accounts and transfers will appear here as you add them.</div>}</div>{graph.nodes.length > 0 && <details className="border-t border-border p-3"><summary className="cursor-pointer text-xs">View accounts as a list</summary><GraphAccessibleList graph={graph} selectedAccountId={selectedAccount} onSelectAccount={setSelectedAccount} className="max-h-48 overflow-auto" /></details>}</div>
              {draft.busy && <p role="status" className="text-sm text-muted-foreground">Checking your transaction network…</p>}
              {draft.result && !result && <p role="status" className="text-sm text-muted-foreground">Backend connection changed. Run assessment again before saving.</p>}
              {result && <>
                <AssessmentResultPanel result={result} />
                {result.status === "completed" && <Button variant="outline" onClick={viewGraph}>View in MuleGraph<ArrowRight /></Button>}
                {result.status === "completed" && (result.findings ?? []).map((finding, index) => <div key={index} className="space-y-2 rounded-lg border border-border bg-panel p-4"><h3 className="text-sm font-semibold">{finding.sourceAccount} → {finding.collectorAccount}</h3><p className="text-xs text-muted-foreground">{finding.pattern.replaceAll("_", " ")} · Evidence score {finding.score.toFixed(4)}</p><Button disabled={busy} onClick={() => void saveFinding(finding)}>{saving ? "Saving…" : "Save case & investigate"}<ArrowRight /></Button></div>)}
                {result.status === "completed" && result.patterns.length === 0 && <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No supported pattern was detected. You can still view this network in MuleGraph. Accounts without findings remain unassessed.</p>}
              </>}
              {attemptedSave && saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
              <p className="text-xs text-muted-foreground">Detection checks fan-out with convergence or rapid forwarding, forwarding chains, circular transfers, fan-in, and dormant-account reactivation. Scores rank evidence strength; they are not fraud probabilities.</p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
