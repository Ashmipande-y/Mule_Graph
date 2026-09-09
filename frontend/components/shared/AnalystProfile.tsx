import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function AnalystProfile({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Avatar size="sm">
        <AvatarFallback>FA</AvatarFallback>
      </Avatar>
      <div className="hidden text-left leading-tight sm:block">
        <p className="text-xs font-medium text-foreground">Fraud Analyst</p>
        <p className="text-[0.65rem] text-muted-foreground">Session-local demo</p>
      </div>
    </div>
  );
}
