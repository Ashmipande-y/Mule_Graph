"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Bot, Database, FlaskConical, LayoutDashboard, Moon, Sun, type LucideIcon } from "lucide-react";
import { Brand } from "@/components/shared/Brand";
import { SimStatusIndicator } from "@/components/shared/SimStatusIndicator";
import { cn } from "@/lib/utils";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { useLiveUpdates } from "@/hooks/useLiveUpdates";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", hint: "Graph, alerts, replay", icon: LayoutDashboard },
  { href: "/investigator", label: "Investigator", hint: "Case-file workspace", icon: Bot },
  { href: "/aml", label: "AML Dataset", hint: "IBM AML benchmark", icon: Database },
  { href: "/tools/xgb-score", label: "Tools", hint: "Standalone XGBoost model", icon: FlaskConical },
];

const subscribeNever = () => () => {};

/**
 * True only once mounted on the client. The resolved theme depends on the
 * OS "system" preference, which the server can't know, so this avoids a
 * hydration mismatch without setting state from an effect body.
 */
function useMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return <div className="size-7 shrink-0" aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
    >
      {isDark ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
    </button>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span>{item.label}</span>
        <span className="text-[0.65rem] font-normal text-muted-foreground">{item.hint}</span>
      </span>
    </Link>
  );
}

/**
 * The persistent app shell every route renders inside (wired in
 * app/layout.tsx): a slim left sidebar (brand, navigation, live/replay
 * status, theme toggle) plus a main content pane. Each route keeps its own
 * internal header/content -- this only supplies the outer chrome that used
 * to be duplicated per-layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const baseUrl = useConsoleStore((s) => s.liveBaseUrl);
  const updates = useLiveUpdates(baseUrl);

  return (
    <div className="flex h-dvh min-h-0 w-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
        <div className="flex h-14 shrink-0 items-center px-4">
          <Brand />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>
        <div className="px-2 py-2"><ConnectionStatusBadge status={updates.status} lastUpdated={updates.lastUpdated} onReconnect={updates.reconnect} /></div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-3">
          <SimStatusIndicator />
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
