"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, Plus, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RiskBadge } from "@/components/shared/RiskBadge";
import {
  BASE_TIMEZONE_OPTIONS,
  emptyAmlFormValues,
  generateNextAmlTransactionId,
  PAYMENT_FORMATS,
  amlTransactionsEqual,
  validateAmlForm,
  withBrowserTimezone,
  type AmlFormErrors,
  type AmlFormValues,
} from "@/lib/services/amlTransactionValidation";
import { useBrowserTimezoneOption } from "@/hooks/useBrowserTimezoneOption";
import { formatPaiseAsInr } from "@/lib/services/amlMoney";
import { formatFullUtc } from "@/lib/format";
import { useAmlStore, useAmlActions } from "@/lib/store/amlStore";

export interface AmlTransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knownAccountIds: string[];
  existingIds: ReadonlySet<string>;
}

export function AmlTransactionDrawer({ open, onOpenChange, knownAccountIds, existingIds }: AmlTransactionDrawerProps) {
  const draftTransaction = useAmlStore((s) => s.draftTransaction);
  const assessStatus = useAmlStore((s) => s.assessStatus);
  const assessResult = useAmlStore((s) => s.assessResult);
  const assessedTransaction = useAmlStore((s) => s.assessedTransaction);
  const assessError = useAmlStore((s) => s.assessError);
  const commitStatus = useAmlStore((s) => s.commitStatus);
  const commitError = useAmlStore((s) => s.commitError);
  const actions = useAmlActions();

  const [values, setValues] = useState<AmlFormValues>(() => emptyAmlFormValues({ id: generateNextAmlTransactionId(existingIds) }));
  const [errors, setErrors] = useState<AmlFormErrors>({});
  const browserTimezone = useBrowserTimezoneOption();
  const timezoneOptions = useMemo(() => withBrowserTimezone(BASE_TIMEZONE_OPTIONS, browserTimezone), [browserTimezone]);

  const isStale = draftTransaction !== null && assessedTransaction !== null && !amlTransactionsEqual(draftTransaction, assessedTransaction);

  function update<K extends keyof AmlFormValues>(key: K, value: AmlFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleReview(event: React.FormEvent) {
    event.preventDefault();
    const { errors: nextErrors, transaction } = validateAmlForm(values, { existingIds });
    setErrors(nextErrors);
    if (transaction) actions.setDraftTransaction(transaction);
  }

  function handleEdit() {
    if (draftTransaction) {
      setValues({
        id: draftTransaction.id,
        sender: draftTransaction.sender,
        receiver: draftTransaction.receiver,
        amountInr: (draftTransaction.amountPaise / 100).toFixed(2),
        date: draftTransaction.timestamp.replace(/Z$/, ""),
        timezoneOffsetMinutes: 0,
        paymentFormat: draftTransaction.paymentFormat,
      });
    }
    actions.clearDraft();
  }

  function handleStartOver() {
    actions.clearDraft();
    setValues(emptyAmlFormValues({ id: generateNextAmlTransactionId(existingIds) }));
    setErrors({});
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) handleStartOver();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{draftTransaction ? "Review & assess transaction" : "Add AML transaction"}</SheetTitle>
          <SheetDescription>
            {draftTransaction
              ? "Confirm the details, run the risk assessment, then decide whether to add it to this session."
              : "Enter one transaction in the IBM synthetic AML benchmark's own schema (paise, ACH/Wire, INR)."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3">
            {!draftTransaction ? (
              <form onSubmit={handleReview} noValidate className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="aml-id" className="text-xs text-muted-foreground">
                    Transaction ID
                  </Label>
                  <Input id="aml-id" value={values.id} onChange={(e) => update("id", e.target.value)} className="mt-1 font-data" aria-invalid={!!errors.id} />
                  {errors.id && <p className="mt-1 text-xs text-risk-high">{errors.id}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="aml-sender" className="text-xs text-muted-foreground">
                      Sender account
                    </Label>
                    <Input
                      id="aml-sender"
                      value={values.sender}
                      onChange={(e) => update("sender", e.target.value)}
                      list="aml-known-accounts"
                      placeholder="Existing or new account"
                      className="mt-1 font-data"
                      aria-invalid={!!errors.sender}
                    />
                    {errors.sender && <p className="mt-1 text-xs text-risk-high">{errors.sender}</p>}
                  </div>
                  <div>
                    <Label htmlFor="aml-receiver" className="text-xs text-muted-foreground">
                      Receiver account
                    </Label>
                    <Input
                      id="aml-receiver"
                      value={values.receiver}
                      onChange={(e) => update("receiver", e.target.value)}
                      list="aml-known-accounts"
                      placeholder="Existing or new account"
                      className="mt-1 font-data"
                      aria-invalid={!!errors.receiver}
                    />
                    {errors.receiver && <p className="mt-1 text-xs text-risk-high">{errors.receiver}</p>}
                  </div>
                </div>
                <datalist id="aml-known-accounts">
                  {knownAccountIds.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="aml-amount" className="text-xs text-muted-foreground">
                      Amount (INR)
                    </Label>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                      <Input
                        id="aml-amount"
                        inputMode="decimal"
                        value={values.amountInr}
                        onChange={(e) => update("amountInr", e.target.value)}
                        placeholder="753279.46"
                        className="pl-6 font-data"
                        aria-invalid={!!errors.amountInr}
                      />
                    </div>
                    {errors.amountInr && <p className="mt-1 text-xs text-risk-high">{errors.amountInr}</p>}
                    <p className="mt-1 text-[0.65rem] text-muted-foreground">Up to 2 decimal places. Converted to exact integer paise.</p>
                  </div>
                  <div>
                    <Label htmlFor="aml-format" className="text-xs text-muted-foreground">
                      Payment format
                    </Label>
                    <Select value={values.paymentFormat} onValueChange={(v) => update("paymentFormat", v as AmlFormValues["paymentFormat"])}>
                      <SelectTrigger id="aml-format" className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_FORMATS.map((format) => (
                          <SelectItem key={format} value={format}>
                            {format}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div>
                    <Label htmlFor="aml-date" className="text-xs text-muted-foreground">
                      Date &amp; time
                    </Label>
                    <Input
                      id="aml-date"
                      type="datetime-local"
                      value={values.date}
                      onChange={(e) => update("date", e.target.value)}
                      className="mt-1 font-data"
                      aria-invalid={!!errors.date}
                    />
                  </div>
                  <div>
                    <Label htmlFor="aml-timezone" className="text-xs text-muted-foreground">
                      Timezone
                    </Label>
                    <Select value={String(values.timezoneOffsetMinutes)} onValueChange={(v) => update("timezoneOffsetMinutes", Number(v))}>
                      <SelectTrigger id="aml-timezone" className="mt-1 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timezoneOptions.map((tz) => (
                          <SelectItem key={tz.label} value={String(tz.offsetMinutes)}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {errors.date && <p className="-mt-2 text-xs text-risk-high">{errors.date}</p>}
                <p className="-mt-1 text-[0.65rem] text-muted-foreground">
                  Normalized to minute precision (seconds forced to :00), matching this dataset&apos;s own resolution.
                </p>

                <div className="mt-1 flex justify-end">
                  <Button type="submit">Review</Button>
                </div>
              </form>
            ) : (
              <>
                <section className="rounded-md border border-border bg-panel-3 p-2.5 text-xs">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="font-semibold tracking-wide text-muted-foreground uppercase">Reviewing</h3>
                    <Button variant="ghost" size="sm" onClick={handleEdit}>
                      Edit
                    </Button>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 font-data">
                    <div>
                      <dt className="text-muted-foreground">ID</dt>
                      <dd className="text-foreground">{draftTransaction.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="text-foreground">{formatPaiseAsInr(draftTransaction.amountPaise)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sender</dt>
                      <dd className="text-foreground">{draftTransaction.sender}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Receiver</dt>
                      <dd className="text-foreground">{draftTransaction.receiver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Timestamp</dt>
                      <dd className="text-foreground">{formatFullUtc(draftTransaction.timestamp)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Format</dt>
                      <dd className="text-foreground">{draftTransaction.paymentFormat}</dd>
                    </div>
                  </dl>
                </section>

                {isStale && (
                  <p className="rounded border border-risk-medium/30 bg-risk-medium/10 px-2 py-1.5 text-[0.7rem] text-risk-medium">
                    Out of date — this transaction changed since it was last assessed. Reassess for a current result.
                  </p>
                )}

                <Button onClick={() => void actions.runAssessment()} disabled={assessStatus === "loading"}>
                  {assessStatus === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Assess risk
                </Button>

                {assessStatus === "error" && assessError && (
                  <p role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-2 font-data text-[0.7rem] text-risk-high">
                    {assessError}
                  </p>
                )}

                {assessStatus === "ready" && assessResult && !isStale && (
                  <section className="flex flex-col gap-2 rounded-md border border-border bg-panel-2 p-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-status-live" />
                      <span className="font-semibold tracking-wide text-foreground uppercase">Assessment result</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="text-muted-foreground">Score</dt>
                        <dd className="font-data font-semibold text-foreground">{assessResult.results[0].score.toFixed(6)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Classification</dt>
                        <dd>
                          <RiskBadge level={assessResult.results[0].isLaundering ? "HIGH" : "LOW"} showIcon={false} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Threshold</dt>
                        <dd className="font-data text-foreground">{assessResult.threshold}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Model version</dt>
                        <dd className="font-data text-foreground">{assessResult.modelVersion}</dd>
                      </div>
                    </dl>
                    <p className="text-[0.65rem] text-muted-foreground">{assessResult.notACalibratedProbabilityNote}</p>
                    <p className="font-data text-[0.65rem] text-muted-foreground">Assessed at {formatFullUtc(assessResult.assessedAt)}</p>

                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Feature values used ({Object.keys(assessResult.results[0].features).length})
                      </summary>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-data text-[0.65rem] text-muted-foreground">
                        {Object.entries(assessResult.results[0].features).map(([name, value]) => (
                          <div key={name} className="flex justify-between gap-2">
                            <span>{name}</span>
                            <span className="text-foreground">{typeof value === "number" ? value.toFixed(4) : String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </details>

                    <div className="mt-1 flex items-center gap-2">
                      <Button
                        onClick={() => {
                          void actions.commitDraftToSession().then(() => {
                            if (useAmlStore.getState().commitStatus === "ready") {
                              toast.success(`${draftTransaction.id} added to session.`);
                              handleStartOver();
                              onOpenChange(false);
                            }
                          });
                        }}
                        disabled={commitStatus === "loading"}
                      >
                        {commitStatus === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                        Add to session
                      </Button>
                      <Button variant="ghost" onClick={handleStartOver}>
                        <RotateCcw className="size-3.5" />
                        Start over
                      </Button>
                    </div>
                    {commitStatus === "error" && commitError && (
                      <p role="alert" className="flex items-center gap-1 text-[0.7rem] text-risk-high">
                        <AlertTriangle className="size-3" /> {commitError}
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
