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
  variant?: "dark" | "light";
  className?: string;
  controls?: boolean;
}

export default function GraphCanvasInner({
  graph,
  selectedAccountId,
  onSelectAccount,
  highlightAccountIds,
  variant = "dark",
  className,
  controls = true,
}: GraphCanvasInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 600, height: 400 });

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

  const backgroundColor = variant === "dark" ? "#0f1318" : "#fbfbfc";
  const linkColorValue = variant === "dark" ? "rgba(231,233,236,0.28)" : "rgba(18,21,26,0.22)";
  const labelColor = variant === "dark" ? "#e7e9ec" : "#12151a";

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
          const isSelected = node.id === selectedAccountId;
          const isDimmed = highlightAccountIds ? !highlightAccountIds.has(node.id as string) : false;
          const bump = node.riskLevel === "HIGH" ? 2.2 : node.riskLevel === "MEDIUM" ? 1.1 : 0;
          const r = 5 + bump;
          const x = node.x ?? 0;
          const y = node.y ?? 0;

          ctx.globalAlpha = isDimmed ? 0.3 : 1;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = riskColor(node.riskLevel, variant);
          ctx.fill();
          if (isSelected) {
            ctx.lineWidth = 2 / globalScale + 1;
            ctx.strokeStyle = variant === "dark" ? "#ffffff" : "#12151a";
            ctx.stroke();
          }

          const fontSize = Math.max(3.4, 11 / globalScale);
          ctx.font = `${fontSize}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = labelColor;
          ctx.fillText(node.label, x, y + r + 2);
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, 10, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={() => linkColorValue}
        linkWidth={(link) => Math.min(4, Math.max(1, Math.log10(Number(link.amount) || 1) - 2))}
        linkDirectionalArrowLength={5}
        linkDirectionalArrowRelPos={1}
        linkLabel={(link) =>
          `${link.id}: ${link.source} → ${link.target}\n₹${Number(link.amount).toLocaleString("en-IN")}`
        }
        onNodeClick={(node) => onSelectAccount(node.id as string)}
        onBackgroundClick={() => onSelectAccount(null)}
        cooldownTicks={100}
        enableNodeDrag
      />

      {controls && (
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => {
              const current = fgRef.current?.zoom();
              if (current !== undefined) fgRef.current?.zoom(current * 1.4, 200);
            }}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-panel-2/90 text-foreground/80 hover:text-foreground"
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
            className="flex size-7 items-center justify-center rounded-md border border-border bg-panel-2/90 text-foreground/80 hover:text-foreground"
          >
            <ZoomOut className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Fit graph to view"
            onClick={() => fgRef.current?.zoomToFit(400, 56)}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-panel-2/90 text-foreground/80 hover:text-foreground"
          >
            <Maximize className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
