import Link from "next/link";
import { ArrowRight, Database, FlaskConical } from "lucide-react";
import { Brand } from "@/components/shared/Brand";
import { LAYOUTS } from "@/lib/layoutRegistry";

export default function LayoutsOverviewPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-panel px-4">
        <Brand />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-xl font-semibold text-foreground">MuleGraph investigation layouts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Five distinct information architectures over the same canonical fan-out/convergence demo scenario and the
            same session-local investigation state. Switching layouts preserves your replay position, selection, and
            notes.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LAYOUTS.map((layout) => {
            const Icon = layout.icon;
            return (
              <Link
                key={layout.slug}
                href={layout.href}
                className="group flex flex-col gap-2 rounded-md border border-border bg-panel-2 p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-data text-xs text-muted-foreground">{layout.number}</span>
                  <Icon className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">{layout.name}</h2>
                <p className="text-xs text-muted-foreground">{layout.tagline}</p>
                <p className="text-xs text-muted-foreground">{layout.description}</p>
                <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                  Open layout
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>

        <Link
          href="/tools/xgb-score"
          className="group flex items-center justify-between gap-3 rounded-md border border-border bg-panel-2 p-4 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="size-5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">XGBoost card-fraud model tool</h2>
              <p className="text-xs text-muted-foreground">
                A separate, standalone demo of <code className="font-data">ml/xgb_baseline</code> via{" "}
                <code className="font-data">POST /api/xgb-score</code> — not mule-network risk, kept off every
                layout above by design.
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <Link
          href="/aml"
          className="group flex items-center justify-between gap-3 rounded-md border border-border bg-panel-2 p-4 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-3">
            <Database className="size-5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">IBM AML dataset</h2>
              <p className="text-xs text-muted-foreground">
                A separate data source and own classifier (<code className="font-data">ml/aml_baseline</code>) over
                27,511 real inter-account transfers from the IBM synthetic AML benchmark — not the canonical demo
                scenario above, and not real UPI customer data.
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </main>
    </div>
  );
}
