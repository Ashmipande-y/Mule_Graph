"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useConsoleStore } from "@/lib/store/consoleStore";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Cumulative transaction volume revealed so far. Useful precisely because
 * it makes the fan-out/convergence pattern's amount conservation visible as
 * a shape (a jump on the fan-out leg, a smaller give-back as money
 * converges) -- not decoration.
 */
export function VolumeTrendChart({ className }: { className?: string }) {
  const transactions = useConsoleStore((s) => s.transactions);
  const revealedCount = useConsoleStore((s) => s.revealedCount);

  const data = transactions.slice(0, revealedCount).reduce<{ step: number; id: string; cumulative: number }[]>(
    (acc, tx, index) => {
      const previous = acc[index - 1]?.cumulative ?? 0;
      acc.push({ step: index + 1, id: tx.id, cumulative: previous + tx.amount });
      return acc;
    },
    [],
  );

  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-[0.7rem] text-muted-foreground", className)}>
        No volume revealed yet
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mg-volume-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-status-info)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--color-status-info)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="step" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            formatter={(value) => [formatINR(Number(value)), "Cumulative volume"]}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.id ?? ""}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="var(--color-status-info)"
            fill="url(#mg-volume-fill)"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
