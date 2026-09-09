import { buildAuthoredExplanation } from "@/lib/services/explanation";
import type { AccountDetail } from "@/lib/services/accountDetail";
import { cn } from "@/lib/utils";

export function ExplanationPanel({ detail, className }: { detail: AccountDetail; className?: string }) {
  const explanation = buildAuthoredExplanation(detail);
  return (
    <div className={cn("rounded-md border border-border bg-panel-3 p-3", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Explanation</h3>
        <span className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
          Authored demo explanation — no AI service connected
        </span>
      </div>
      <p className="mb-1.5 text-sm font-medium text-foreground">{explanation.headline}</p>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {explanation.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
