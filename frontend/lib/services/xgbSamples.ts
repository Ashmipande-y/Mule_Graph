import rawSamples from "@/data/xgb_score_samples.json";
import type { XgbScoreSample } from "@/types/xgbScore";

interface RawXgbSample {
  description: string;
  label: "fraud" | "legit";
  known_class: 0 | 1;
  time: number;
  amount: number;
  v: number[];
  model_score: number;
  model_is_fraud: boolean;
}

/**
 * Byte-for-byte bundled copy of backend/examples/xgb_score_samples.json --
 * 4 real rows from the model's held-out test split (2 known-fraud, 2
 * known-legit, including one deliberately-included false negative so this
 * fixture doesn't overstate the model's accuracy). See
 * backend/examples/README.md for provenance.
 */
export const XGB_SCORE_SAMPLES: XgbScoreSample[] = (rawSamples as RawXgbSample[]).map((sample) => ({
  description: sample.description,
  label: sample.label,
  knownClass: sample.known_class,
  time: sample.time,
  amount: sample.amount,
  v: sample.v,
  modelScore: sample.model_score,
  modelIsFraud: sample.model_is_fraud,
}));
