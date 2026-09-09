"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LAYOUTS } from "@/lib/layoutRegistry";
import { cn } from "@/lib/utils";

/**
 * Every item here is a real, working destination -- the other four
 * investigation layouts -- not a decorative placeholder for a section that
 * doesn't exist.
 */
export function CommandSideNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Investigation views"
      className={cn("flex w-12 flex-col items-center gap-1 border-r border-border bg-panel py-2", className)}
    >
      {LAYOUTS.map((layout) => {
        const Icon = layout.icon;
        const active = pathname === layout.href;
        return (
          <Tooltip key={layout.slug}>
            <TooltipTrigger asChild>
              <Link
                href={layout.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-primary/15 text-primary",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="sr-only">{layout.name}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{layout.name}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
