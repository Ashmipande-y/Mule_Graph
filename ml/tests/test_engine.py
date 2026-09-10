import datetime
import unittest
from pathlib import Path

from rules.account_risk import account_risk_from_findings
from rules.engine import RulesEngineConfig, detect_all_patterns
from rules.replay import evaluate_all_at
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


class RulesEngineTests(unittest.TestCase):
    def test_canonical_demo_produces_fan_out_convergence_with_deduplication(self):
        """Canonical demo fixture should produce the primary fan_out_convergence finding.
        Redundant standalone fan-in alert for ACC_X is deduplicated.
        """
        transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)
        findings = detect_all_patterns(transactions)

        # Primary finding is fan_out_convergence
        foc = [f for f in findings if f.pattern == "fan_out_convergence"]
        self.assertEqual(len(foc), 1)
        finding = foc[0]
        self.assertEqual(finding.source_account, "ACC_A")
        self.assertEqual(finding.collector_account, "ACC_X")
        self.assertEqual(finding.rule_version, "1.0.0")
        self.assertIn("Rapid fan-out from ACC_A", finding.explanation)
        self.assertEqual(finding.involved_accounts, ("ACC_A", "ACC_B", "ACC_C", "ACC_D", "ACC_X"))

    def test_multi_pattern_mixed_stream(self):
        """A stream containing both a circular transfer and a rapid forwarding chain."""
        transactions = [
            # Pattern 1: Circular transfer (C1, C2, C3)
            tx("C1", "CYCLE_1", "CYCLE_2", 30000, 0),
            tx("C2", "CYCLE_2", "CYCLE_3", 29000, 5),
            tx("C3", "CYCLE_3", "CYCLE_1", 28500, 12),
            # Pattern 2: Forwarding chain (F1, F2, F3)
            tx("F1", "CHAIN_A", "CHAIN_B", 40000, 20),
            tx("F2", "CHAIN_B", "CHAIN_C", 38000, 30),
            tx("F3", "CHAIN_C", "CHAIN_D", 36000, 42),
        ]

        findings = detect_all_patterns(transactions)
        patterns_found = {f.pattern for f in findings}
        self.assertIn("circular_transfer", patterns_found)
        self.assertIn("rapid_forwarding", patterns_found)

        # Verify account risk aggregation over multi-pattern findings
        risk_map = account_risk_from_findings(findings)
        self.assertIn("CYCLE_1", risk_map)
        self.assertIn("cycle_originator", risk_map["CYCLE_1"].roles)
        self.assertIn("CHAIN_A", risk_map)
        self.assertIn("chain_originator", risk_map["CHAIN_A"].roles)
        self.assertIn("CHAIN_D", risk_map)
        self.assertIn("chain_recipient", risk_map["CHAIN_D"].roles)

    def test_evaluate_all_at_replay(self):
        """Replay up to t=10s only observes transactions up to t=10s."""
        transactions = [
            tx("C1", "CYCLE_1", "CYCLE_2", 30000, 0),
            tx("C2", "CYCLE_2", "CYCLE_3", 29000, 5),
            tx("C3", "CYCLE_3", "CYCLE_1", 28500, 15),  # completes at 15s
        ]
        # At t=10s, cycle is not yet complete
        as_of_10 = BASE_TIME + datetime.timedelta(seconds=10)
        findings_at_10 = evaluate_all_at(transactions, as_of_10)
        self.assertEqual(findings_at_10, [])

        # At t=15s, cycle is complete
        as_of_15 = BASE_TIME + datetime.timedelta(seconds=15)
        findings_at_15 = evaluate_all_at(transactions, as_of_15)
        self.assertEqual(len(findings_at_15), 1)
        self.assertEqual(findings_at_15[0].pattern, "circular_transfer")

    def test_fan_out_with_rapid_forwarding_is_detected(self):
        transactions = [
            tx("TX_1", "ACCOUNT_A", "ACCOUNT_B", 10000, 0),
            tx("TX_2", "ACCOUNT_A", "ACCOUNT_C", 9950, 120),
            tx("TX_3", "ACCOUNT_A", "ACCOUNT_D", 9800, 240),
            tx("TX_4", "ACCOUNT_D", "ACCOUNT_E", 9700, 360),
        ]
        findings = detect_all_patterns(transactions)
        finding = next(f for f in findings if f.pattern == "fan_out_rapid_forwarding")
        self.assertGreaterEqual(finding.score, 0.75)
        self.assertEqual(finding.evidence_transaction_ids, ("TX_1", "TX_2", "TX_3", "TX_4"))

    def test_two_hop_payment_without_fan_out_is_not_flagged(self):
        transactions = [
            tx("P1", "PERSON", "MERCHANT", 10000, 0),
            tx("P2", "MERCHANT", "SUPPLIER", 9900, 120),
        ]
        self.assertEqual(detect_all_patterns(transactions), [])

    def test_fan_out_forwarding_requires_timing_and_amount_evidence(self):
        funding = [
            tx("P1", "A", "B", 10000, 0),
            tx("P2", "A", "C", 9950, 120),
            tx("P3", "A", "D", 9800, 240),
        ]
        for amount, time in [(9700, 541), (1000, 360), (9700, 239)]:
            with self.subTest(amount=amount, time=time):
                self.assertEqual(detect_all_patterns(funding + [tx("P4", "D", "E", amount, time)]), [])
        self.assertEqual(detect_all_patterns(funding), [])

    def test_fan_out_forwarding_window_covers_all_evidence(self):
        transactions = [
            tx("P1", "A", "B", 10000, 0),
            tx("P2", "B", "E", 9900, 60),
            tx("P3", "A", "C", 9950, 120),
            tx("P4", "A", "D", 9800, 240),
        ]
        finding = next(f for f in detect_all_patterns(transactions) if f.pattern == "fan_out_rapid_forwarding")
        self.assertEqual(finding.window_end, transactions[-1].timestamp)


if __name__ == "__main__":
    unittest.main()
