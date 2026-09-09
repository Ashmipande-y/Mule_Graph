"use client";

import Link from "next/link";
import { useCaseStore } from "@/lib/store/caseStore";
import { toast } from "sonner";
import { Flag, ShieldCheck, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useConsoleStore, useConsoleActions } from "@/lib/store/consoleStore";

/**
 * Flag and Freeze are explicitly simulated: the confirmation copy says so
 * every time, and the resulting badges (SimulatedActionBadges) never drop
 * the "(simulated)" qualifier. Nothing here calls a real system.
 */
export function InvestigationActions({ accountId }: { accountId: string }) {
  const actionState = useConsoleStore((s) => s.simulatedActions[accountId]);
  const actions = useConsoleActions();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" asChild>
          <Link href="/investigator" onClick={() => { actions.selectAccount(accountId); useCaseStore.getState().select(null); }}>
            <ShieldCheck /> Investigate evidence
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={actionState?.flagged}>
              <Flag /> {actionState?.flagged ? "Flagged" : "Flag account"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Flag {accountId}?</AlertDialogTitle>
              <AlertDialogDescription>
                This is a simulated demo action. It records a flag in this browser session only — it does not
                contact any bank system and no real account is changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  actions.flag(accountId);
                  toast.warning(`${accountId} flagged (simulated).`);
                }}
              >
                Flag (simulated)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {actionState?.flagged && (
          <Button size="sm" variant="ghost" onClick={() => actions.unflag(accountId)}>
            Clear flag
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={actionState?.frozen}>
              <Snowflake /> {actionState?.frozen ? "Frozen" : "Freeze account"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Freeze {accountId}?</AlertDialogTitle>
              <AlertDialogDescription>
                This is a simulated demo action. It records a freeze in this browser session only — no real bank
                account is touched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  actions.freeze(accountId);
                  toast.error(`${accountId} frozen (simulated).`);
                }}
              >
                Freeze (simulated)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {actionState?.frozen && (
          <Button size="sm" variant="ghost" onClick={() => actions.unfreeze(accountId)}>
            Lift freeze
          </Button>
        )}
      </div>
    </div>
  );
}
