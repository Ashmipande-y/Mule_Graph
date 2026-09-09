import { Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Waypoints className="size-4 text-primary" aria-hidden="true" />
      <span className="font-data text-sm font-semibold tracking-tight text-foreground">MuleGraph</span>
    </div>
  );
}
