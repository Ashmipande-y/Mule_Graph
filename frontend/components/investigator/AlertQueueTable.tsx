import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/format";
import type { InvestigatorScenario } from "@/lib/services/investigatorScenario";

/**
 * One real row (the canonical demo's actual detected case) -- a real
 * deployment would queue many; this demo has exactly one detected network,
 * so that's exactly how many real rows this table shows. No invented rows
 * are added just to make the queue look fuller.
 */
export function AlertQueueTable({ scenario, onOpenCase }: { scenario: InvestigatorScenario; onOpenCase: () => void }) {
  const { finding, flaggedAccountId, flaggedAccountLabel, accountRisk, intermediaryIds, strict } = scenario;
  if (!finding || !flaggedAccountId) {
    return <p className="p-3 text-sm text-muted-foreground">No case detected in the current dataset.</p>;
  }
  const risk = accountRisk.get(flaggedAccountId);

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs text-muted-foreground">
        This demo&apos;s canonical dataset contains exactly one detected network, so exactly one real row appears below — a
        production deployment would queue many concurrently.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Case ID</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Risk band</TableHead>
            <TableHead className="text-right">Exposure</TableHead>
            <TableHead className="text-right">Fan-in count</TableHead>
            <TableHead className="text-right">Fan-out count</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-data">CASE_{finding.sourceAccount}_{finding.collectorAccount}</TableCell>
            <TableCell className="font-data">{flaggedAccountLabel} ({flaggedAccountId})</TableCell>
            <TableCell>{risk && <RiskBadge level={risk.riskLevel} />}</TableCell>
            <TableCell className="text-right font-data">{formatINR(strict.exposure)}</TableCell>
            <TableCell className="text-right font-data">{intermediaryIds.length}</TableCell>
            <TableCell className="text-right font-data">{intermediaryIds.length}</TableCell>
            <TableCell>
              <Button size="sm" onClick={onOpenCase}>
                Open case <ArrowRight className="size-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
