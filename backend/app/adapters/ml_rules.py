"""The one place that wires the backend to the existing `ml/rules` package.

Per backend/README.md's Stage 2 note: "these imports currently require the
repository's ml/ directory to be on the Python module path. Keep that setup
explicit in one adapter/launch configuration, independent of the working
directory. Do not scatter path mutations across endpoints or copy the ML
package into the backend." This module is that one place.

Nothing here retrains, copies, or modifies ml/rules — it only imports the
existing entry points documented in backend/README.md's "Verified existing
ML entry points" table.
"""

from __future__ import annotations

from typing import Sequence

from app.adapters._ml_path import ensure_ml_on_path

ensure_ml_on_path()

from rules.account_risk import AccountRisk, account_risk_from_findings  # noqa: E402
from rules.detector import Finding  # noqa: E402
from rules.replay import evaluate_at  # noqa: E402
from rules.transactions import Transaction, TransactionParseError  # noqa: E402

__all__ = [
    "AccountRisk",
    "Finding",
    "MlRulesError",
    "assess_accounts",
    "evaluate_transactions",
]


class MlRulesError(Exception):
    """Raised when already-validated records cannot be handed to ml/rules."""


def _transactions_from_records(records: Sequence[dict]) -> list[Transaction]:
    try:
        return [Transaction.from_dict(record) for record in records]
    except TransactionParseError as exc:
        raise MlRulesError(str(exc)) from exc


def evaluate_transactions(records: Sequence[dict]) -> tuple[list[Transaction], list[Finding], dict[str, AccountRisk]]:
    """Run the Stage 1 fan-out/convergence detector over the given records,
    returning the parsed transactions, the network-level findings, and the
    account-level risk rollup -- the full evidence set `POST /api/assess`
    needs (both `patterns` and `accounts` in its response), not just the
    account rollup `assess_accounts` (below) exposes for `GET /api/graph`.

    `records` must already be validated (see
    `app.services.graph.validate_transactions`) — this only re-parses them
    into the ml/rules Transaction type.

    There is no ingestion/replay endpoint yet (Stage 2), so this evaluates
    "as of" the latest transaction timestamp present in `records`: the
    full-fixture case of `evaluate_at`, not a bypass of it — a static
    snapshot has no transaction after its own latest timestamp that could
    leak into the result.
    """
    transactions = _transactions_from_records(records)
    if not transactions:
        return [], [], {}
    as_of = max(tx.timestamp for tx in transactions)
    findings = evaluate_at(transactions, as_of)
    account_risk = account_risk_from_findings(findings)
    return transactions, findings, account_risk


def assess_accounts(records: Sequence[dict]) -> dict[str, AccountRisk]:
    """Run the Stage 1 fan-out/convergence detector over the given records
    and return only the account-level risk rollup (see `evaluate_transactions`
    above for the full findings/account-risk pair)."""
    _, _, account_risk = evaluate_transactions(records)
    return account_risk
