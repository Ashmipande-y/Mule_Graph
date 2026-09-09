import unittest
from pathlib import Path

from rules.account_risk import (
    RISK_LEVEL_HIGH_THRESHOLD,
    RISK_LEVEL_MEDIUM_THRESHOLD,
    account_risk_from_findings,
    risk_level_for_score,
)
from rules.detector import detect_fan_out_convergence
from rules.transactions import load_transactions

REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_TRANSACTIONS_PATH = REPO_ROOT / "data" / "demo_transactions.json"


class AccountRiskFromFindingsTests(unittest.TestCase):
    def setUp(self):
        transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)
        self.findings = detect_fan_out_convergence(transactions)
        self.account_risk = account_risk_from_findings(self.findings)

    def test_every_account_in_the_finding_is_represented(self):
        self.assertEqual(
            set(self.account_risk),
            {"ACC_A", "ACC_B", "ACC_C", "ACC_D", "ACC_X"},
        )

    def test_source_and_collector_roles(self):
        self.assertEqual(self.account_risk["ACC_A"].roles, ("source",))
        self.assertEqual(self.account_risk["ACC_X"].roles, ("collector",))

    def test_intermediary_evidence_is_its_own_pair_only(self):
        # ACC_B only ever appears via TX_002 (received) and TX_005 (forwarded).
        # It must not be credited with ACC_C's or ACC_D's transactions.
        b = self.account_risk["ACC_B"]
        self.assertEqual(b.roles, ("intermediary",))
        self.assertEqual(set(b.evidence_transaction_ids), {"TX_002", "TX_005"})

        c = self.account_risk["ACC_C"]
        self.assertEqual(set(c.evidence_transaction_ids), {"TX_003", "TX_006"})

        d = self.account_risk["ACC_D"]
        self.assertEqual(set(d.evidence_transaction_ids), {"TX_004", "TX_007"})

    def test_collector_evidence_is_all_convergence_transactions(self):
        x = self.account_risk["ACC_X"]
        self.assertEqual(set(x.evidence_transaction_ids), {"TX_005", "TX_006", "TX_007"})

    def test_max_score_matches_the_single_finding_score(self):
        finding_score = self.findings[0].score
        for account_risk in self.account_risk.values():
            self.assertEqual(account_risk.max_score, finding_score)
            self.assertEqual(account_risk.finding_count, 1)

    def test_risk_level_property_matches_the_canonical_finding_score(self):
        # The canonical fixture's single finding scores 0.9317, above the
        # HIGH threshold.
        for account_risk in self.account_risk.values():
            self.assertEqual(account_risk.risk_level, "HIGH")

    def test_to_dict_includes_risk_level(self):
        for account_risk in self.account_risk.values():
            self.assertEqual(account_risk.to_dict()["risk_level"], "HIGH")


class RiskLevelForScoreTests(unittest.TestCase):
    def test_high_at_and_above_threshold(self):
        self.assertEqual(risk_level_for_score(RISK_LEVEL_HIGH_THRESHOLD), "HIGH")
        self.assertEqual(risk_level_for_score(1.0), "HIGH")

    def test_medium_at_and_above_threshold_below_high(self):
        self.assertEqual(risk_level_for_score(RISK_LEVEL_MEDIUM_THRESHOLD), "MEDIUM")
        self.assertEqual(risk_level_for_score(RISK_LEVEL_HIGH_THRESHOLD - 0.0001), "MEDIUM")

    def test_low_below_medium_threshold(self):
        self.assertEqual(risk_level_for_score(0.0), "LOW")
        self.assertEqual(risk_level_for_score(RISK_LEVEL_MEDIUM_THRESHOLD - 0.0001), "LOW")


if __name__ == "__main__":
    unittest.main()
