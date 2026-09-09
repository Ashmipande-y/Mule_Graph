"use client";

import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssessmentActions } from "@/lib/store/assessmentStore";

/**
 * The single entry point into the transaction-entry + assessment workflow,
 * embedded in SimulationControls so it appears next to the existing replay
 * toolbar in every layout that already renders SimulationControls (all
 * five). The actual drawer is mounted once, globally (see app/layout.tsx),
 * so this button just opens it. Icon-only with a tooltip in compact mode --
 * Terminal and Graph-First's toolbars are already dense, and a full text
 * label there would push other controls into overflow.
 */
export function AddTransactionButton({ compact = false }: { compact?: boolean }) {
  const actions = useAssessmentActions();

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add transaction"
            onClick={() => actions.openWorkspace({ startAdding: true })}
          >
            <PlusCircle />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add transaction</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button variant="outline" onClick={() => actions.openWorkspace({ startAdding: true })}>
      <PlusCircle />
      Add transaction
    </Button>
  );
}
