"use client";

import { AlertCard } from "./AlertCard";
import { EmptyState } from "@/components/shared/States";
import type { Alert } from "@/types/alert";
import { cn } from "@/lib/utils";

export function AlertList({
  alerts,
  selectedAccountId,
  onSelectAccount,
  className,
}: {
  alerts: Alert[];
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  className?: string;
}) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        title="No alerts yet"
        description="An alert appears once a detected pattern's evidence is fully revealed by replay."
        className={className}
      />
    );
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)} aria-label="Active alerts">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <AlertCard
            alert={alert}
            onSelectAccount={onSelectAccount}
            selected={[alert.finding.sourceAccount, ...alert.finding.intermediaryAccounts, alert.finding.collectorAccount].includes(
              selectedAccountId ?? "",
            )}
          />
        </li>
      ))}
    </ul>
  );
}
