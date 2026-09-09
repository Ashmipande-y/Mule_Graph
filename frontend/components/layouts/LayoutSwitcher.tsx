"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, FlaskConical, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LAYOUTS } from "@/lib/layoutRegistry";
import { cn } from "@/lib/utils";

/**
 * Layout switching is a route change (each layout is its own page), so
 * cross-layout state (replay position, selection, notes, etc.) survives it
 * automatically -- it all lives in the module-level zustand console store,
 * not in any one layout's component tree.
 */
export function LayoutSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", className)}>
          <LayoutGrid className="size-3.5" />
          Layouts
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch investigation layout</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LAYOUTS.map((layout) => {
          const Icon = layout.icon;
          const active = pathname === layout.href;
          return (
            <DropdownMenuItem key={layout.slug} asChild data-active={active || undefined}>
              <Link href={layout.href} className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-sm">{layout.name}</span>
                  <span className="block text-[0.7rem] text-muted-foreground">{layout.number}</span>
                </span>
                {active && <span className="text-[0.65rem] font-medium text-primary">Current</span>}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/layouts">All layouts overview</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-active={pathname === "/tools/xgb-score" || undefined}>
          <Link href="/tools/xgb-score" className="flex items-center gap-2">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-sm">XGBoost model tool</span>
              <span className="block text-[0.7rem] text-muted-foreground">Standalone — not mule-network risk</span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-active={pathname === "/aml" || undefined}>
          <Link href="/aml" className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-sm">IBM AML dataset</span>
              <span className="block text-[0.7rem] text-muted-foreground">Separate data source, own model</span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
