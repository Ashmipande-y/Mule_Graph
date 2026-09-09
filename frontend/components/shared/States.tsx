import { AlertCircle, Inbox, Loader2, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span role="status">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-1.5 py-10 text-center", className)}>
      <Inbox className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export function NoResultsState({ query, className }: { query: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-1.5 py-10 text-center", className)}>
      <SearchX className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No results for &ldquo;{query}&rdquo;</p>
      <p className="text-xs text-muted-foreground">Try a different account ID, transaction ID, or clear filters.</p>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, className }: { title?: string; description?: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-1.5 py-10 text-center", className)} role="alert">
      <AlertCircle className="mb-1 size-5 text-risk-high" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm font-data text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
