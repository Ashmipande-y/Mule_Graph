"use client";

import { useState } from "react";
import { Info, Loader2, PlayCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackendUrlEditor } from "@/components/layouts/BackendUrlEditor";
import { XGB_SCORE_SAMPLES } from "@/lib/services/xgbSamples";
import { postXgbScore, XgbScoreApiError } from "@/lib/services/apiClient";
import { useConsoleStore } from "@/lib/store/consoleStore";
import type { XgbScoreResult } from "@/types/xgbScore";

type Status = "idle" | "loading" | "error" | "ready";

/**
 * A standalone demo surface for ml/xgb_baseline, reached only through
 * POST /api/xgb-score. Deliberately kept off every fraud-investigation
 * layout and never touches the console store's graph/risk state -- see
 * backend/docs/integration-contract.md: this model "does not feed
 * /api/graph or account risk in any way."
 */
export function XgbScoreTool() {
  const liveBaseUrl = useConsoleStore((s) => s.liveBaseUrl);
  const [sampleIndex, setSampleIndex] = useState(0);
  const sample = XGB_SCORE_SAMPLES[sampleIndex];
  const [amount, setAmount] = useState(sample.amount);
  const [time, setTime] = useState(sample.time);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<XgbScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectSample(index: number) {
    const next = XGB_SCORE_SAMPLES[index];
    setSampleIndex(index);
    setAmount(next.amount);
    setTime(next.time);
    setStatus("idle");
    setResult(null);
    setError(null);
  }

  async function runScore() {
    setStatus("loading");
    setError(null);
    try {
      const scoreResult = await postXgbScore(liveBaseUrl, { time, amount, v: sample.v });
      setResult(scoreResult);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof XgbScoreApiError ? cause.message : "Unexpected error contacting the backend.");
      setStatus("error");
    }
  }

  const matchesFixture =
    result !== null &&
    amount === sample.amount &&
    time === sample.time &&
    Math.abs(result.score - sample.modelScore) < 1e-4 &&
    result.isFraud === sample.modelIsFraud;

  return (
    <div className="flex h-full flex-col overflow-auto bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-sm font-semibold text-foreground">Tools</h1>
        <span className="ml-3 text-xs text-muted-foreground">XGBoost Card-Fraud Model</span>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
        <div className="rounded-md border border-risk-medium/30 bg-risk-medium/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-risk-medium">
            <Info className="size-3.5" aria-hidden="true" />
            Not mule-network risk
          </p>
          <p className="mt-1 text-muted-foreground">
            This is a separate, standalone demonstration of <code className="font-data">ml/xgb_baseline</code> — a
            real trained XGBoost model on the OpenML card-present-fraud dataset (Time/Amount/V1..V28 PCA features).
            It has no account/graph structure and is structurally incompatible with MuleGraph&apos;s
            sender/receiver data. It never feeds <code className="font-data">/api/graph</code> or any account&apos;s
            risk score. It exists here to prove <code className="font-data">ml/xgb_baseline</code> connects
            end-to-end through the backend — nothing more.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-panel-2 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Backend</p>
            <p className="font-data text-sm text-foreground">{liveBaseUrl}</p>
          </div>
          <BackendUrlEditor />
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border bg-panel-2 p-4">
          <div>
            <Label className="text-xs text-muted-foreground">Sample row (from the model&apos;s held-out test split)</Label>
            <Select value={String(sampleIndex)} onValueChange={(value) => selectSample(Number(value))}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {XGB_SCORE_SAMPLES.map((item, index) => (
                  <SelectItem key={item.description} value={String(index)}>
                    {item.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sample.label === "fraud" ? "destructive" : "secondary"}>Known: {sample.label}</Badge>
            <span className="text-xs text-muted-foreground">
              Fixture prediction: score {sample.modelScore.toFixed(6)}, is_fraud {String(sample.modelIsFraud)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="xgb-time" className="text-xs text-muted-foreground">
                Time
              </Label>
              <Input
                id="xgb-time"
                type="number"
                value={time}
                onChange={(event) => setTime(Number(event.target.value))}
                className="mt-1 font-data"
              />
            </div>
            <div>
              <Label htmlFor="xgb-amount" className="text-xs text-muted-foreground">
                Amount
              </Label>
              <Input
                id="xgb-amount"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="mt-1 font-data"
              />
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              V1..V28 (anonymized PCA features, from the sample — not editable)
            </summary>
            <p className="mt-1.5 font-data text-[0.65rem] break-all text-muted-foreground">
              {sample.v.map((n) => n.toFixed(4)).join(", ")}
            </p>
          </details>

          <div className="flex items-center gap-2">
            <Button onClick={runScore} disabled={status === "loading"}>
              {status === "loading" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <PlayCircle className="size-3.5" aria-hidden="true" />
              )}
              Run score
            </Button>
            <Button variant="ghost" onClick={() => selectSample(sampleIndex)}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset to sample
            </Button>
          </div>
        </div>

        {status === "error" && error && (
          <div className="rounded-md border border-risk-high/30 bg-risk-high/10 p-3 font-data text-xs text-risk-high" role="alert">
            {error}
          </div>
        )}

        {status === "ready" && result && (
          <div className="rounded-md border border-border bg-panel-2 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Live model result</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">score (predict_proba)</dt>
                <dd className="font-data font-semibold text-foreground">{result.score.toFixed(6)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">is_fraud</dt>
                <dd className="font-data font-semibold text-foreground">{String(result.isFraud)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">threshold</dt>
                <dd className="font-data font-semibold text-foreground">{result.threshold}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">model_mode</dt>
                <dd className="font-data font-semibold text-foreground">{result.modelMode}</dd>
              </div>
            </dl>
            {matchesFixture && (
              <p className="mt-3 text-xs text-status-live">Matches the recorded fixture prediction exactly.</p>
            )}
            <p className="mt-2 text-[0.65rem] text-muted-foreground">
              This is the model&apos;s own genuine predict_proba output for a card-present transaction — unlike
              ml/rules&apos; hand-defined heuristic evidence score, this IS a trained model output, but for a
              different domain (card fraud, not UPI mule networks).
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
