"use client";

import { toast } from "sonner";
import { FlaskConical, Loader2, PlayCircle, PlusCircle, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingState } from "@/components/shared/States";
import { AssessmentResultPanel } from "@/components/investigation/AssessmentResultPanel";
import { AssessmentServiceNotConnected } from "@/components/investigation/AssessmentServiceNotConnected";
import { TransactionForm } from "./TransactionForm";
import { SubmissionPreviewTable } from "./SubmissionPreviewTable";
import { useAssessmentWorkspace } from "@/hooks/useAssessmentWorkspace";
import { useConsoleActions } from "@/lib/store/consoleStore";
import { cn } from "@/lib/utils";

/**
 * Mounted once, globally (see app/layout.tsx), so every layout opens the
 * exact same workspace via AddTransactionButton -- one implementation,
 * consistent behavior everywhere, per "reuse the same input and assessment
 * components wherever practical."
 */
export function AssessmentWorkspaceSheet() {
  const {
    isOpen,
    formMode,
    editingTransaction,
    pendingTransactions,
    networkMode,
    currentNetworkTransactions,
    submissionSet,
    existingAccountIds,
    idsInUse,
    latestKnownTimestamp,
    status,
    result,
    previousResult,
    error,
    isStale,
    canRun,
    actions,
    runAssessment,
  } = useAssessmentWorkspace();
  const consoleActions = useConsoleActions();

  const title = formMode === "hidden" ? "Assessment workspace" : formMode === "edit" ? "Edit transaction" : "Add transaction";
  const description =
    formMode === "hidden"
      ? "Review pending transactions, choose the network context, and run a risk assessment."
      : "Enter one transaction. It is added to the pending list below, not submitted yet.";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) actions.closeWorkspace();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3">
            {formMode !== "hidden" ? (
              <TransactionForm
                mode={formMode}
                initialTransaction={editingTransaction}
                existingAccountIds={existingAccountIds}
                idsInUse={idsInUse}
                suggestedTimestamp={latestKnownTimestamp}
                onSubmit={(tx) => {
                  if (formMode === "edit" && editingTransaction) {
                    actions.updatePending(editingTransaction.id, tx);
                    toast.success(`${tx.id} updated.`);
                  } else {
                    actions.addPending(tx);
                    toast.success(`${tx.id} added to assessment.`);
                  }
                }}
                onCancel={() => actions.cancelForm()}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" onClick={() => actions.startAdd()}>
                      <PlusCircle className="size-3.5" />
                      Add transaction
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const replacedExisting = actions.loadExampleNetwork();
                        toast(
                          replacedExisting
                            ? "Replaced your pending transactions with the 7-transaction canonical demo network (sample data)."
                            : "Loaded the 7-transaction canonical demo network (sample data).",
                        );
                      }}
                    >
                      <FlaskConical className="size-3.5" />
                      Load example network
                    </Button>
                  </div>
                  {(pendingTransactions.length > 0 || result) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        actions.startNewAssessment();
                        toast("Workspace cleared.");
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      Clear &amp; start over
                    </Button>
                  )}
                </div>

                <div
                  className="flex w-fit items-center rounded-md border border-border bg-panel-3 p-0.5 text-xs"
                  role="group"
                  aria-label="Network context for this assessment"
                >
                  <button
                    type="button"
                    aria-pressed={networkMode === "include-current"}
                    onClick={() => actions.setNetworkMode("include-current")}
                    className={cn(
                      "rounded px-2 py-1 font-medium transition-colors",
                      networkMode === "include-current" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Include current network
                  </button>
                  <button
                    type="button"
                    aria-pressed={networkMode === "new-only"}
                    onClick={() => actions.setNetworkMode("new-only")}
                    className={cn(
                      "rounded px-2 py-1 font-medium transition-colors",
                      networkMode === "new-only" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Start a new assessment
                  </button>
                </div>
                <p className="-mt-2 text-[0.65rem] text-muted-foreground">
                  {networkMode === "include-current"
                    ? "Submitting will assess the current network plus your pending transactions together."
                    : "Submitting will assess only your pending transactions, ignoring the current network."}
                </p>

                <div>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Transactions to submit ({submissionSet.length})
                  </h3>
                  <SubmissionPreviewTable
                    networkTransactions={networkMode === "include-current" ? currentNetworkTransactions : []}
                    pendingTransactions={pendingTransactions}
                    onEditPending={(id) => actions.startEdit(id)}
                    onRemovePending={(id) => actions.removePending(id)}
                    className="max-h-64 rounded-md border border-border"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={runAssessment} disabled={!canRun}>
                    {status === "loading" ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <PlayCircle className="size-3.5" aria-hidden="true" />
                    )}
                    Run risk assessment
                  </Button>
                  {pendingTransactions.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Add at least one transaction to run an assessment.
                    </span>
                  )}
                </div>

                {status === "loading" && <LoadingState label="Running risk assessment…" />}

                {status === "error" && error && <AssessmentServiceNotConnected message={error} />}

                {(status === "loading" || status === "error") && previousResult && (
                  <AssessmentResultPanel result={previousResult} isPrevious />
                )}

                {status === "success" && result && (
                  <AssessmentResultPanel
                    result={result}
                    isStale={isStale}
                    onSelectAccount={(id) => {
                      // The workspace is a full-height overlay covering the
                      // layout's own account inspector -- close it so
                      // selecting an account here actually surfaces its
                      // evidence, instead of selecting into a panel the
                      // analyst can't see yet.
                      consoleActions.selectAccount(id);
                      actions.closeWorkspace();
                    }}
                  />
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
