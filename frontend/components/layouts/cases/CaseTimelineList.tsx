import { ArrowRightLeft, Flag, MessageSquare, ShieldCheck, Snowflake } from "lucide-react";
import type { CaseTimelineEvent } from "@/lib/services/caseTimeline";
import { formatFullUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

function iconFor(event: CaseTimelineEvent) {
  if (event.type === "transaction") return ArrowRightLeft;
  if (event.title.toLowerCase().includes("flag")) return Flag;
  if (event.title.toLowerCase().includes("froz") || event.title.toLowerCase().includes("freeze")) return Snowflake;
  if (event.title.toLowerCase().includes("note")) return MessageSquare;
  return ShieldCheck;
}

export function CaseTimelineList({ events, className }: { events: CaseTimelineEvent[]; className?: string }) {
  if (events.length === 0) {
    return <p className={cn("p-3 text-xs text-muted-foreground", className)}>No timeline activity yet for this case.</p>;
  }

  return (
    <ol className={cn("flex flex-col gap-3 p-3", className)}>
      {events.map((event) => {
        const Icon = iconFor(event);
        return (
          <li key={event.id} className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-panel-2">
              <Icon className="size-3 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0 text-xs">
              <p className="text-foreground">{event.title}</p>
              <p className="font-data text-[0.65rem] text-muted-foreground">
                {formatFullUtc(event.timestamp)}
                {event.subtitle ? ` · ${event.subtitle}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
