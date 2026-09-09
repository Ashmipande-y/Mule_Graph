import datetime
import unittest
from pathlib import Path

from rules.detector import DetectorConfig, detect_fan_out_convergence
from rules.transactions import Transaction, load_transactions

REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_TRANSACTIONS_PATH = REPO_ROOT / "data" / "demo_transactions.json"

BASE_TIME = datetime.datetime(2026, 1, 1, 10, 0, 0, tzinfo=datetime.timezone.utc)


def tx(tx_id: str, sender: str, receiver: str, amount: int, offset_seconds: int) -> Transaction:
    return Transaction(
        id=tx_id,
        sender=sender,
        receiver=receiver,
        amount=amount,
        timestamp=BASE_TIME + datetime.timedelta(seconds=offset_seconds),
    )


class PositiveScenarioTests(unittest.TestCase):
    """The canonical demo fixture is a known fan-out/convergence case. These
    tests check detector *behavior* against it; they do not hardcode any
    account id or score into the detection logic itself (see detector.py)."""

    def test_canonical_fixture_produces_one_finding(self):
        transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)
        findings = detect_fan_out_convergence(transactions)

        self.assertEqual(len(findings), 1)
        finding = findings[0]
        self.assertEqual(finding.pattern, "fan_out_convergence")
        self.assertEqual(finding.source_account, "ACC_A")
        self.assertEqual(finding.collector_account, "ACC_X")
        self.assertEqual(finding.intermediary_accounts, ("ACC_B", "ACC_C", "ACC_D"))
        self.assertEqual(set(finding.fan_out_transaction_ids), {"TX_002", "TX_003", "TX_004"})
        self.assertEqual(set(finding.convergence_transaction_ids), {"TX_005", "TX_006", "TX_007"})
        self.assertGreaterEqual(finding.score, 0.0)
        self.assertLessEqual(finding.score, 1.0)
        self.assertIn("not a calibrated probability", finding.score_method)

    def test_generic_synthetic_scenario_with_arbitrary_ids(self):
        """Same shape as the demo, but with unrelated account/transaction ids
        and amounts, to confirm the detector isn't secretly keyed to the
        fixture's specific strings."""
        transactions = [
            tx("E1", "P", "Q", 9000, 0),
            tx("E2", "P", "R", 8000, 4),
            tx("E3", "P", "S", 7000, 8),
            tx("E4", "Q", "Z", 8500, 20),
            tx("E5", "R", "Z", 7500, 24),
            tx("E6", "S", "Z", 6500, 28),
        ]
        findings = detect_fan_out_convergence(transactions)
        self.assertEqual(len(findings), 1)
        finding = findings[0]
        self.assertEqual(finding.source_account, "P")
        self.assertEqual(finding.collector_account, "Z")
        self.assertEqual(finding.intermediary_accounts, ("Q", "R", "S"))


class NearMissTests(unittest.TestCase):
    def test_fan_out_without_convergence_yields_no_finding(self):
        transactions = [
            tx("E1", "P", "Q", 9000, 0),
            tx("E2", "P", "R", 8000, 4),
            tx("E3", "P", "S", 7000, 8),
            # Q, R, S each forward funds onward, but to three DIFFERENT
            # accounts, not one common collector.
            tx("E4", "Q", "Z1", 8500, 20),
            tx("E5", "R", "Z2", 7500, 24),
            tx("E6", "S", "Z3", 6500, 28),
        ]
        findings = detect_fan_out_convergence(transactions)
        self.assertEqual(findings, [])

    def test_convergence_outside_window_yields_no_finding(self):
        config = DetectorConfig(min_intermediaries=3, fan_out_window_seconds=60, convergence_window_seconds=60)
        transactions = [
            tx("E1", "P", "Q", 9000, 0),
            tx("E2", "P", "R", 8000, 4),
            tx("E3", "P", "S", 7000, 8),
            # Convergence happens ~190s after receipt, far outside the 60s
            # convergence window, so it must not count as evidence.
            tx("E4", "Q", "Z", 8500, 200),
            tx("E5", "R", "Z", 7500, 210),
            tx("E6", "S", "Z", 6500, 220),
        ]
        findings = detect_fan_out_convergence(transactions, config=config)
        self.assertEqual(findings, [])

    def test_duplicate_input_records_do_not_inflate_evidence(self):
        base_transactions = [
            tx("E1", "P", "Q", 9000, 0),
            tx("E2", "P", "R", 8000, 4),
            tx("E3", "P", "S", 7000, 8),
            tx("E4", "Q", "Z", 8500, 20),
            tx("E5", "R", "Z", 7500, 24),
            tx("E6", "S", "Z", 6500, 28),
        ]
        baseline = detect_fan_out_convergence(base_transactions)

        duplicated_transactions = base_transactions + [
            tx("E1", "P", "Q", 9000, 0),  # exact duplicate record (same id)
            tx("E4", "Q", "Z", 8500, 20),  # exact duplicate record (same id)
        ]
        with_duplicates = detect_fan_out_convergence(duplicated_transactions)

        self.assertEqual(len(baseline), 1)
        self.assertEqual(len(with_duplicates), 1)
        self.assertEqual(baseline[0].score, with_duplicates[0].score)
        self.assertEqual(baseline[0].evidence["total_fan_out_amount"], with_duplicates[0].evidence["total_fan_out_amount"])
        self.assertEqual(
            baseline[0].evidence["total_convergence_amount"], with_duplicates[0].evidence["total_convergence_amount"]
        )

    def test_fewer_than_minimum_intermediaries_yields_no_finding(self):
        # Only two intermediaries converge; default min_intermediaries is 3.
        transactions = [
            tx("E1", "P", "Q", 9000, 0),
            tx("E2", "P", "R", 8000, 4),
            tx("E3", "Q", "Z", 8500, 20),
            tx("E4", "R", "Z", 7500, 24),
        ]
        findings = detect_fan_out_convergence(transactions)
        self.assertEqual(findings, [])

    def test_collector_cannot_be_the_source_or_an_intermediary(self):
        # P fans out to Q, R, S; S then forwards back to P (the source) and
        # to Q (an intermediary) -- neither should count as a valid collector.
        transactions = [
            tx("E1", "P", "Q", 9000, 0),
            tx("E2", "P", "R", 8000, 4),
            tx("E3", "P", "S", 7000, 8),
            tx("E4", "Q", "Z", 8500, 20),
            tx("E5", "R", "Z", 7500, 24),
            tx("E6", "S", "P", 6500, 28),  # back to source
            tx("E7", "S", "Q", 6500, 30),  # to another intermediary
        ]
        findings = detect_fan_out_convergence(transactions)
        self.assertEqual(findings, [])  # only 2 valid intermediaries (Q, R) reach Z; below threshold of 3


if __name__ == "__main__":
    unittest.main()
