"""Account-level risk, derived from network-level findings but kept as a
separate data shape.

The brief is explicit that account-level risk and network-level findings
must be kept separate before any inference interface is frozen with the
backend. A Finding describes a network pattern across several accounts; an
AccountRisk describes one account's exposure across all findings it appears
in. Callers wanting to fill the API contract's per-node `risk_score` /
`risk_level` fields should go through this module (`AccountRisk.risk_level`
/ `risk_level_for_score`) rather than reading fields off a Finding directly.

The score->level mapping (see `risk_level_for_score` below) is a backend
proposal adopted here as a provisional single source of truth as of
2026-09-09 (backend/docs/integration-contract.md) — it is not yet formally
agreed between Jatin, Ashmi, and Smit. An account absent from every finding
has no AccountRisk record at all; callers must report that as UNASSESSED,
not by calling this mapping with a score of 0.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Sequence

from .detector import Finding


# risk_score -> risk_level mapping. Per this module's docstring above,
# callers wanting the API contract's per-node risk_level should go through
# this module rather than inventing their own cut points. Adopted from the
# backend's proposal in backend/docs/integration-contract.md — still
# provisional pending formal sign-off between Jatin, Ashmi, and Smit; change
# these two constants once thresholds are actually agreed.
RISK_LEVEL_HIGH_THRESHOLD = 0.75
RISK_LEVEL_MEDIUM_THRESHOLD = 0.4


def risk_level_for_score(score: float) -> str:
    """Map a max_score in [0, 1] to a coarse LOW/MEDIUM/HIGH bucket.

    Only meaningful for an account that already has an AccountRisk record
    (i.e. appears in at least one finding). An account with no findings at
    all must be reported as UNASSESSED by the caller, never as LOW --
    absence of evidence is not evidence of low risk.
    """
    if score >= RISK_LEVEL_HIGH_THRESHOLD:
        return "HIGH"
    if score >= RISK_LEVEL_MEDIUM_THRESHOLD:
        return "MEDIUM"
    return "LOW"


@dataclass(frozen=True)
class AccountRisk:
    account_id: str
    roles: tuple[str, ...]  # e.g. ("source",), ("intermediary",), ("collector",)
    max_score: float
    finding_count: int
    evidence_transaction_ids: tuple[str, ...]

    @property
    def risk_level(self) -> str:
        return risk_level_for_score(self.max_score)

    def to_dict(self) -> dict:
        return {
            "account_id": self.account_id,
            "roles": list(self.roles),
            "max_score": self.max_score,
            "risk_level": self.risk_level,
            "finding_count": self.finding_count,
            "evidence_transaction_ids": list(self.evidence_transaction_ids),
            "score_is_not_a_probability": True,
        }


def account_risk_from_findings(findings: Sequence[Finding]) -> dict[str, AccountRisk]:
    """Roll network-level findings up into one risk record per account.

    An account's `max_score` is the highest score among findings it appears
    in (in any role); `finding_count` is how many distinct findings it
    appears in. This is a simple aggregation, not a new scoring method — it
    does not combine scores across findings into anything resembling a
    probability.
    """
    roles: dict[str, set[str]] = defaultdict(set)
    scores: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    tx_ids: dict[str, set[str]] = defaultdict(set)

    def touch(account: str, role: str, finding: Finding, tx_ids_for_account: Sequence[str]) -> None:
        roles[account].add(role)
        scores[account] = max(scores[account], finding.score)
        counts[account] += 1
        tx_ids[account].update(tx_ids_for_account)

    for finding in findings:
        if finding.pattern == "fan_out_convergence":
            touch(finding.source_account, "source", finding, finding.fan_out_transaction_ids)
            # intermediary_accounts, fan_out_transaction_ids, and convergence_transaction_ids
            # are built (in detector.py) as parallel tuples over the same "converging"
            # order, so each intermediary's own evidence is the same-index pair, not
            # every transaction in the finding.
            for intermediary, fan_out_tx_id, convergence_tx_id in zip(
                finding.intermediary_accounts, finding.fan_out_transaction_ids, finding.convergence_transaction_ids
            ):
                touch(intermediary, "intermediary", finding, (fan_out_tx_id, convergence_tx_id))
            touch(finding.collector_account, "collector", finding, finding.convergence_transaction_ids)
        elif finding.pattern == "circular_transfer":
            originator = finding.source_account
            for acc in finding.involved_accounts:
                role = "cycle_originator" if acc == originator else "cycle_intermediary"
                touch(acc, role, finding, finding.evidence_transaction_ids)
        elif finding.pattern == "rapid_forwarding":
            originator = finding.source_account
            recipient = finding.collector_account
            for acc in finding.involved_accounts:
                if acc == originator:
                    role = "chain_originator"
                elif acc == recipient:
                    role = "chain_recipient"
                else:
                    role = "chain_intermediary"
                touch(acc, role, finding, finding.evidence_transaction_ids)
        elif finding.pattern == "fan_out_rapid_forwarding":
            touch(finding.source_account, "source", finding, finding.fan_out_transaction_ids)
            forwarder = finding.intermediary_accounts[0]
            touch(forwarder, "rapid_forwarder", finding, finding.evidence_transaction_ids)
            touch(finding.collector_account, "recipient", finding, finding.convergence_transaction_ids)
        elif finding.pattern == "fan_in_collector":
            touch(finding.collector_account, "collector", finding, finding.evidence_transaction_ids)
            for sender in finding.intermediary_accounts:
                touch(sender, "fan_in_sender", finding, finding.evidence_transaction_ids)
        elif finding.pattern == "dormant_reactivation":
            touch(finding.source_account, "dormant_account", finding, finding.evidence_transaction_ids)
            for counterparty in finding.intermediary_accounts:
                touch(counterparty, "reactivation_counterparty", finding, finding.evidence_transaction_ids)
        else:
            for acc in finding.involved_accounts:
                touch(acc, "involved", finding, finding.evidence_transaction_ids)

    return {
        account: AccountRisk(
            account_id=account,
            roles=tuple(sorted(account_roles)),
            max_score=scores[account],
            finding_count=counts[account],
            evidence_transaction_ids=tuple(sorted(tx_ids[account])),
        )
        for account, account_roles in roles.items()
    }
