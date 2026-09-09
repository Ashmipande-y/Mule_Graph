"""Response assembly for `POST /api/assess`.

Kept out of `app/api/assess.py` so the route handler stays a thin HTTP
adapter with no business logic, matching this repo's stated backend layout
(`api/` = route handlers only, `services/` = the actual logic) -- the same
split `app/services/graph.py::_build_graph` already uses for `GET /api/graph`.
"""

from __future__ import annotations

from app.adapters.ml_rules import AccountRisk, Finding
from app.schemas import AssessAccountResult, AssessPatternResult


def build_assessment_result(
    transactions: list[dict],
    findings: list[Finding],
    account_risk: dict[str, AccountRisk],
) -> tuple[list[AssessAccountResult], list[AssessPatternResult], list[str]]:
    """Derive per-account results, per-pattern findings, and the review list
    from already-validated transactions and `ml_rules.evaluate_transactions`
    output. Returns (accounts, patterns, accounts_requiring_review)."""
    account_ids: set[str] = set()
    for tx in transactions:
        account_ids.add(tx["sender"])
        account_ids.add(tx["receiver"])

    accounts: list[AssessAccountResult] = []
    for account_id in sorted(account_ids):
        risk = account_risk.get(account_id)
        if risk is None:
            # Absent from every finding is "not assessed", not "proven
            # safe" -- same rule GET /api/graph enforces (see
            # app/services/graph.py::_build_graph).
            accounts.append(
                AssessAccountResult(
                    account_id=account_id,
                    risk_score=None,
                    risk_level="UNASSESSED",
                    roles=[],
                    finding_count=0,
                    evidence_transaction_ids=[],
                )
            )
        else:
            accounts.append(
                AssessAccountResult(
                    account_id=account_id,
                    risk_score=risk.max_score,
                    risk_level=risk.risk_level,
                    roles=list(risk.roles),
                    finding_count=risk.finding_count,
                    evidence_transaction_ids=list(risk.evidence_transaction_ids),
                )
            )

    patterns = [
        AssessPatternResult(
            pattern=f.pattern,
            source_account=f.source_account,
            collector_account=f.collector_account,
            intermediary_accounts=list(f.intermediary_accounts),
            score=f.score,
            score_method=f.score_method,
            evidence=f.evidence,
        )
        for f in findings
    ]

    accounts_requiring_review = [a.account_id for a in accounts if a.risk_level in ("HIGH", "MEDIUM")]

    return accounts, patterns, accounts_requiring_review
