"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import type { GraphEdge, GraphNode, GraphSnapshot } from "@/types/graph";
import { riskColor } from "@/lib/riskColors";
import { cn } from "@/lib/utils";

type FGNode = GraphNode & { x?: number; y?: number };
type FGLink = GraphEdge;

export interface GraphCanvasInnerProps {
  graph: GraphSnapshot;
  selectedAccountId: string | null;
  onSelectAccount: (id: string | null) => void;
  highlightAccountIds?: ReadonlySet<string>;
  /** Edges to render more prominently (thicker, risk-accent-colored) while
   * dimming every other edge -- e.g. transactions independently confirmed
   * by a ground-truth label, distinct from this graph's own risk scoring. */
  highlightEdgeIds?: ReadonlySet<string>;
  variant?: "dark" | "light";
  className?: string;
  controls?: boolean;
}

export default function GraphCanvasInner({
  graph,
  selectedAccountId,
  onSelectAccount,
  highlightAccountIds,
  highlightEdgeIds,
  variant = "dark",
  className,
  controls = true,
}: GraphCanvasInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ ...n }) as FGNode),
      links: graph.edges.map((e) => ({ ...e }) as FGLink),
    }),
    [graph],
  );

  // Repeated transfers between the same two accounts are never collapsed
  // into one edge (each is separate evidence) -- but drawn as straight
  // lines they'd overlap into one indistinguishable stroke. Spread edges
  // sharing a node pair across a small curvature fan so every one stays
  // visually separable.
  const edgeCurvatureById = useMemo(() => {
    const groups = new Map<string, FGLink[]>();
    for (const link of graphData.links) {
      const key = [link.source, link.target].sort().join("::");
      const group = groups.get(key);
      if (group) group.push(link);
      else groups.set(key, [link]);
    }
    const byId = new Map<string, number>();
    for (const group of groups.values()) {
      if (group.length === 1) {
        byId.set(group[0].id, 0);
        continue;
      }
      const step = 0.35 / group.length;
      group.forEach((link, index) => {
        byId.set(link.id, step * (index - (group.length - 1) / 2) * 2);
      });
    }
    return byId;
  }, [graphData]);

  // A composition key, not just counts: a newly-assessed network can swap
  // in different accounts/edges at the same count (e.g. one transaction
  // edited), which must still trigger fit-to-view.
  const graphCompositionKey = useMemo(
    () => `${graph.nodes.map((n) => n.id).join(",")}|${graph.edges.map((e) => e.id).join(",")}`,
    [graph],
  );

  useEffect(() => {
    const id = setTimeout(() => fgRef.current?.zoomToFit(400, 56), 260);
    return () => clearTimeout(id);
  }, [graphCompositionKey, size.width, size.height]);

  const backgroundColor = variant === "dark" ? "#131313" : "#ffffff";
  const linkColorValue = variant === "dark" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const linkDimColorValue = variant === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const labelColor = variant === "dark" ? "#e5e5e5" : "#171717";
  const labelDimColor = variant === "dark" ? "rgba(229,229,229,0.45)" : "rgba(23,23,23,0.4)";
  const accentColor = riskColor("HIGH", variant);
  const hasEdgeHighlight = !!highlightEdgeIds && highlightEdgeIds.size > 0;

  return (
    <div
      ref={containerRef}
      className={cn("relative min-h-0 min-w-0", className)}
      role="img"
      aria-label={`Transaction network graph: ${graph.nodes.length} accounts and ${graph.edges.length} transfers. An accessible list of the same data follows this graph.`}
    >
      <ForceGraph2D<FGNode, FGLink>
        ref={fgRef}
        width={size.width || undefined}
        height={size.height || undefined}
        graphData={graphData}
        backgroundColor={backgroundColor}
        nodeId="id"
        nodeRelSize={5}
        nodeLabel={(n) =>
          `${n.label} (${n.id})\nRisk: ${n.riskLevel}${n.riskScore !== null ? ` — evidence score ${n.riskScore.toFixed(4)}` : ""}`
        }
        nodeCanvasObject={(node, ctx, globalScale) => {
          const id = node.id as string;
          const isSelected = id === selectedAccountId;
          const isHovered = id === hoveredNodeId;
          const isDimmed = highlightAccountIds ? !highlightAccountIds.has(id) : false;
          const bump = node.riskLevel === "HIGH" ? 2.2 : node.riskLevel === "MEDIUM" ? 1.1 : 0;
          const r = 5 + bump;
          const x = node.x ?? 0;
          const y = node.y ?? 0;

          ctx.globalAlpha = isDimmed ? 0.3 : 1;

          if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.arc(x, y, r + (isSelected ? 5 : 3.5), 0, 2 * Math.PI);
            ctx.fillStyle = isSelected ? `${accentColor}33` : variant === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = riskColor(node.riskLevel, variant);
          ctx.fill();
          if (isSelected) {
            ctx.lineWidth = 2 / globalScale + 1;
            ctx.strokeStyle = variant === "dark" ? "#ffffff" : "#0a0a0a";
            ctx.stroke();
          }

          // Below this zoom, only keep labels for nodes that are actual
          // signal (HIGH/MEDIUM/selected/hovered) legible -- everything
          // else would clutter into overlapping text on a dense graph.
          const isSignal = node.riskLevel === "HIGH" || node.riskLevel === "MEDIUM" || isSelected || isHovered;
          if (globalScale < 0.55 && !isSignal) {
            ctx.globalAlpha = 1;
            return;
          }

          const fontSize = Math.max(3.4, 11 / globalScale);
          ctx.font = `${fontSize}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = globalScale < 0.55 ? labelColor : isSignal ? labelColor : labelDimColor;
          ctx.fillText(node.label, x, y + r + 2);
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, 10, 0, 2 * Math.PI);
          ctx.fill();
        }}
        onNodeHover={(node) => setHoveredNodeId(node ? (node.id as string) : null)}
        linkCurvature={(link) => edgeCurvatureById.get(link.id) ?? 0}
        linkColor={(link) =>
          hasEdgeHighlight ? (highlightEdgeIds!.has(link.id) ? accentColor : linkDimColorValue) : linkColorValue
        }
        linkWidth={(link) => {
          const base = Math.min(4, Math.max(1, Math.log10(Number(link.amount) || 1) - 2));
          return hasEdgeHighlight && highlightEdgeIds!.has(link.id) ? base + 1.5 : base;
        }}
        linkDirectionalArrowLength={5}
        linkDirectionalArrowRelPos={1}
        linkLabel={(link) =>
          `${link.id}: ${link.source} → ${link.target}\n₹${Number(link.amount).toLocaleString("en-IN")}` +
          (hasEdgeHighlight && highlightEdgeIds!.has(link.id) ? "\n(ground-truth labeled)" : "")
        }
        onNodeClick={(node) => onSelectAccount(node.id as string)}
        onBackgroundClick={() => onSelectAccount(null)}
        cooldownTicks={100}
        enableNodeDrag
      />

      {controls && (
        <div className="absolute right-2 top-2 flex flex-col gap-0.5 rounded-md border border-border bg-panel-2/90 p-0.5 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => {
              const current = fgRef.current?.zoom();
              if (current !== undefined) fgRef.current?.zoom(current * 1.4, 200);
            }}
            className="flex size-7 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-panel-3 hover:text-foreground"
          >
            <ZoomIn className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => {
              const current = fgRef.current?.zoom();
              if (current !== undefined) fgRef.current?.zoom(current / 1.4, 200);
            }}
            className="flex size-7 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-panel-3 hover:text-foreground"
          >
            <ZoomOut className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Fit graph to view"
            onClick={() => fgRef.current?.zoomToFit(400, 56)}
            className="flex size-7 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-panel-3 hover:text-foreground"
          >
            <Maximize className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
