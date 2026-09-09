#!/usr/bin/env python3
"""Demo POST /api/xgb-score against a running backend using real example rows.

Reads backend/examples/xgb_score_samples.json (see that directory's README
for provenance) and posts each row to a running backend, printing the live
result next to the recorded known label and the model's own recorded
output -- they should match exactly, since it's the same trained model.

Stdlib only, no dependency on requests/httpx, matching scripts/validate_demo.py.

Usage (backend must already be running -- see backend/README.md):
    python backend/scripts/demo_xgb_score.py
    python backend/scripts/demo_xgb_score.py --base-url http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DEFAULT_SAMPLES_PATH = BACKEND_DIR / "examples" / "xgb_score_samples.json"


def post_score(base_url: str, time_value: float, amount: float, v: list[float]) -> dict:
    payload = json.dumps({"time": time_value, "amount": amount, "v": v}).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/xgb-score",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES_PATH)
    args = parser.parse_args(argv)

    samples = json.loads(args.samples.read_text(encoding="utf-8"))

    mismatches = 0
    for sample in samples:
        try:
            result = post_score(args.base_url, sample["time"], sample["amount"], sample["v"])
        except urllib.error.URLError as exc:
            print(f"FAIL: could not reach {args.base_url}/api/xgb-score: {exc}", file=sys.stderr)
            return 1

        recorded_score = sample["model_score"]
        live_score = result["score"]
        match = "OK" if abs(live_score - recorded_score) < 1e-4 else "MISMATCH"
        if match == "MISMATCH":
            mismatches += 1

        print(
            f"[{match}] {sample['label']} (known_class={sample['known_class']}, {sample['description']}): "
            f"live score={live_score:.6f} is_fraud={result['is_fraud']} | "
            f"recorded score={recorded_score:.6f} is_fraud={sample['model_is_fraud']}"
        )

    if mismatches:
        print(f"\n{mismatches} row(s) did not match the recorded fixture output.", file=sys.stderr)
        return 1

    print(f"\nAll {len(samples)} sample rows matched their recorded fixture output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
