"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { GraphCanvasInnerProps } from "./GraphCanvasInner";

/**
 * react-force-graph-2d touches `window`/canvas at module scope, so it must
 * never run during SSR (it would throw or, worse, silently produce a
 * server/client markup mismatch). Loading it through next/dynamic with
 * ssr:false keeps it entirely client-side.
 */
const GraphCanvasInner = dynamic(() => import("./GraphCanvasInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading graph renderer…
    </div>
  ),
});

export default function GraphCanvas(props: GraphCanvasInnerProps) {
  return <GraphCanvasInner {...props} />;
}
