#!/usr/bin/env python3
"""Run the Stage 1 fan-out/convergence rules detector against the canonical
demo transactions and print what it finds.

This is a demonstration/manual-check script, not a service. It has no
FastAPI, database, or frontend dependency — it only reads
data/demo_transactions.json and prints findings to stdout.

Usage (from repository root):
    python ml/scripts/run_rules_demo.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ML_DIR = SCRIPT_DIR.parent
REPO_ROOT = ML_DIR.parent
DEFAULT_TRANSACTIONS_PATH = REPO_ROOT / "data" / "demo_transactions.json"

sys.path.insert(0, str(ML_DIR))

from rules.account_risk import account_risk_from_findings  # noqa: E402
from rules.detector import detect_fan_out_convergence  # noqa: E402
from rules.transactions import load_transactions  # noqa: E402


def main() -> int:
    transactions = load_transactions(DEFAULT_TRANSACTIONS_PATH)
    findings = detect_fan_out_convergence(transactions)
    account_risk = account_risk_from_findings(findings)

    print(f"Loaded {len(transactions)} transactions from {DEFAULT_TRANSACTIONS_PATH}")
    print(f"Findings: {len(findings)}")
    for finding in findings:
        print(json.dumps(finding.to_dict(), indent=2))

    print(f"\nAccount-level risk (derived, not frozen with backend): {len(account_risk)} accounts")
    for account_id in sorted(account_risk):
        print(json.dumps(account_risk[account_id].to_dict(), indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
