import { Building2, FolderKanban, Radar, Share2, Terminal, type LucideIcon } from "lucide-react";

export interface LayoutMeta {
  slug: string;
  href: string;
  number: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
}

export const LAYOUTS: LayoutMeta[] = [
  {
    slug: "command",
    href: "/layouts/command",
    number: "01",
    name: "Fraud Operations Command Center",
    tagline: "Monitor an unfolding network in real time",
    description:
      "System bar, left navigation, operational metrics, a large central graph, a right-hand account inspector, and a transaction event stream.",
    icon: Radar,
  },
  {
    slug: "terminal",
    href: "/layouts/terminal",
    number: "02",
    name: "Data Terminal",
    tagline: "Dense, keyboard-driven institutional finance styling",
    description:
      "Alerts column, a transaction table as the dominant surface, a compact graph, and discoverable keyboard shortcuts.",
    icon: Terminal,
  },
  {
    slug: "graph",
    href: "/layouts/graph",
    number: "03",
    name: "Graph-First Investigation",
    tagline: "The network itself is the interaction surface",
    description:
      "A near full-bleed graph with account search, risk filters, a legend, and a bottom timeline scrubber.",
    icon: Share2,
  },
  {
    slug: "cases",
    href: "/layouts/cases",
    number: "04",
    name: "Case Investigation Workspace",
    tagline: "Casework with evidence, timeline, and notes",
    description:
      "Three columns: cases on the left, the network and investigation timeline in the center, evidence and analyst notes on the right.",
    icon: FolderKanban,
  },
  {
    slug: "enterprise",
    href: "/layouts/enterprise",
    number: "05",
    name: "Modern Enterprise Banking",
    tagline: "A neutral, internal banking application",
    description:
      "Light theme, horizontal navigation, compact statistics, a large graph, priority alerts, and a monitoring table.",
    icon: Building2,
  },
];

export function layoutBySlug(slug: string): LayoutMeta | undefined {
  return LAYOUTS.find((l) => l.slug === slug);
}
