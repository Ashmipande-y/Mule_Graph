"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BASE_TIMEZONE_OPTIONS,
  emptyFormValues,
  generateNextTransactionId,
  suggestNextDateTimeLocal,
  utcIsoToDateTimeLocal,
  validateTransactionForm,
  withBrowserTimezone,
  type TransactionFormErrors,
  type TransactionFormValues,
} from "@/lib/services/transactionValidation";
import { useBrowserTimezoneOption } from "@/hooks/useBrowserTimezoneOption";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";

export interface TransactionFormProps {
  mode: "add" | "edit";
  initialTransaction: Transaction | null;
  existingAccountIds: string[];
  /** IDs already in use elsewhere; when editing, the transaction's own current id is excluded so it doesn't flag itself. */
  idsInUse: ReadonlySet<string>;
  /** The latest known timestamp in scope, used to default a new transaction's date/time shortly after it. Null when there's nothing to anchor to. */
  suggestedTimestamp: string | null;
  onSubmit: (tx: Transaction) => void;
  onCancel: () => void;
}

function initialValuesFor(
  mode: "add" | "edit",
  initialTransaction: Transaction | null,
  idsInUse: ReadonlySet<string>,
  suggestedTimestamp: string | null,
): TransactionFormValues {
  if (mode === "edit" && initialTransaction) {
    return {
      id: initialTransaction.id,
      sender: initialTransaction.sender,
      receiver: initialTransaction.receiver,
      amount: String(initialTransaction.amount),
      date: utcIsoToDateTimeLocal(initialTransaction.timestamp),
      timezoneOffsetMinutes: 0,
    };
  }
  return emptyFormValues({
    id: generateNextTransactionId(idsInUse),
    date: suggestNextDateTimeLocal(suggestedTimestamp) ?? "",
  });
}

export function TransactionForm({
  mode,
  initialTransaction,
  existingAccountIds,
  idsInUse,
  suggestedTimestamp,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [values, setValues] = useState<TransactionFormValues>(() =>
    initialValuesFor(mode, initialTransaction, idsInUse, suggestedTimestamp),
  );
  const [dateWasSuggested, setDateWasSuggested] = useState(mode === "add" && suggestedTimestamp !== null);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const browserTimezone = useBrowserTimezoneOption();

  const timezoneOptions = useMemo(
    () => withBrowserTimezone(BASE_TIMEZONE_OPTIONS, browserTimezone),
    [browserTimezone],
  );

  // Uniqueness must not flag the transaction's own current id against itself while editing.
  const idsInUseForValidation = useMemo(() => {
    if (mode !== "edit" || !initialTransaction) return idsInUse;
    const copy = new Set(idsInUse);
    copy.delete(initialTransaction.id);
    return copy;
  }, [idsInUse, mode, initialTransaction]);

  function update<K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "date") setDateWasSuggested(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { errors: nextErrors, transaction } = validateTransactionForm(values, {
      existingIds: idsInUseForValidation,
    });
    setErrors(nextErrors);
    if (transaction) onSubmit(transaction);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3" aria-label="Add transaction">
      <div>
        <Label htmlFor="tx-id" className="text-xs text-muted-foreground">
          Transaction ID
        </Label>
        <Input
          id="tx-id"
          value={values.id}
          onChange={(event) => update("id", event.target.value)}
          className="mt-1 font-data"
          aria-invalid={!!errors.id}
          aria-describedby={errors.id ? "tx-id-error" : undefined}
        />
        {errors.id && (
          <p id="tx-id-error" role="alert" className="mt-1 text-xs text-risk-high">
            {errors.id}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tx-sender" className="text-xs text-muted-foreground">
            Sender account
          </Label>
          <Input
            id="tx-sender"
            value={values.sender}
            onChange={(event) => update("sender", event.target.value)}
            list="known-account-ids"
            placeholder="ACC_A or new ID"
            className="mt-1 font-data"
            aria-invalid={!!errors.sender}
            aria-describedby={errors.sender ? "tx-sender-error" : undefined}
          />
          {errors.sender && (
            <p id="tx-sender-error" role="alert" className="mt-1 text-xs text-risk-high">
              {errors.sender}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="tx-receiver" className="text-xs text-muted-foreground">
            Receiver account
          </Label>
          <Input
            id="tx-receiver"
            value={values.receiver}
            onChange={(event) => update("receiver", event.target.value)}
            list="known-account-ids"
            placeholder="ACC_X or new ID"
            className="mt-1 font-data"
            aria-invalid={!!errors.receiver}
            aria-describedby={errors.receiver ? "tx-receiver-error" : undefined}
          />
          {errors.receiver && (
            <p id="tx-receiver-error" role="alert" className="mt-1 text-xs text-risk-high">
              {errors.receiver}
            </p>
          )}
        </div>
      </div>
      <datalist id="known-account-ids">
        {existingAccountIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      <div>
        <Label htmlFor="tx-amount" className="text-xs text-muted-foreground">
          Amount (INR)
        </Label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
            ₹
          </span>
          <Input
            id="tx-amount"
            inputMode="numeric"
            value={values.amount}
            onChange={(event) => update("amount", event.target.value)}
            placeholder="50000"
            className="pl-6 font-data"
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? "tx-amount-error" : undefined}
          />
        </div>
        {errors.amount && (
          <p id="tx-amount-error" role="alert" className="mt-1 text-xs text-risk-high">
            {errors.amount}
          </p>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <Label htmlFor="tx-date" className="text-xs text-muted-foreground">
            Date &amp; time
          </Label>
          <Input
            id="tx-date"
            type="datetime-local"
            step={1}
            value={values.date}
            onChange={(event) => update("date", event.target.value)}
            className="mt-1 font-data"
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? "tx-date-error" : undefined}
          />
        </div>
        <div>
          <Label htmlFor="tx-timezone" className="text-xs text-muted-foreground">
            Timezone
          </Label>
          <Select
            value={String(values.timezoneOffsetMinutes)}
            onValueChange={(value) => update("timezoneOffsetMinutes", Number(value))}
          >
            <SelectTrigger id="tx-timezone" className="mt-1 w-48">
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
      {errors.date && (
        <p id="tx-date-error" role="alert" className={cn("-mt-2 text-xs text-risk-high")}>
          {errors.date}
        </p>
      )}
      {dateWasSuggested && !errors.date && (
        <p className="-mt-2 text-[0.65rem] text-status-info">
          Suggested: shortly after the latest known transaction. Edit if this transaction happened at a different
          time.
        </p>
      )}
      <p className="-mt-1 text-[0.65rem] text-muted-foreground">
        Stored internally as UTC ISO 8601, second precision (e.g. 2026-01-01T10:00:00Z), consistent with the
        transaction contract.
      </p>

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{mode === "edit" ? "Save changes" : "Add to assessment"}</Button>
      </div>
    </form>
  );
}
