import datetime
import unittest

from rules.circular import CircularConfig, detect_circular_transfers
from rules.transactions import Transaction

BASE_TIME = datetime.datetime(2026, 1, 1, 10, 0, 0, tzinfo=datetime.timezone.utc)


def tx(tx_id: str, sender: str, receiver: str, amount: int, offset_seconds: int) -> Transaction:
    return Transaction(
        id=tx_id,
        sender=sender,
        receiver=receiver,
        amount=amount,
        timestamp=BASE_TIME + datetime.timedelta(seconds=offset_seconds),
    )


class CircularTransferTests(unittest.TestCase):
    def test_positive_three_hop_cycle(self):
        """A -> B -> C -> A completed in 30s with high fund retention."""
        transactions = [
            tx("C1", "ACC_1", "ACC_2", 20000, 0),
            tx("C2", "ACC_2", "ACC_3", 19500, 10),
            tx("C3", "ACC_3", "ACC_1", 19000, 25),
        ]
        findings = detect_circular_transfers(transactions)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual(f.pattern, "circular_transfer")
        self.assertEqual(f.involved_accounts, ("ACC_1", "ACC_2", "ACC_3"))
        self.assertEqual(f.evidence_transaction_ids, ("C1", "C2", "C3"))
        self.assertAlmostEqual(f.measured_signals["retention_ratio"], 0.95, places=2)
        self.assertEqual(f.measured_signals["cycle_length"], 3)
        self.assertIn("Circular transfer detected", f.explanation)
        self.assertGreater(f.score, 0.5)

    def test_positive_two_hop_roundtrip(self):
        """X -> Y -> X round-trip completed within 15s."""
        transactions = [
            tx("R1", "ACC_X", "ACC_Y", 50000, 0),
            tx("R2", "ACC_Y", "ACC_X", 48000, 15),
        ]
        findings = detect_circular_transfers(transactions)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual(f.involved_accounts, ("ACC_X", "ACC_Y"))
        self.assertEqual(f.evidence_transaction_ids, ("R1", "R2"))
        self.assertAlmostEqual(f.measured_signals["retention_ratio"], 0.96, places=2)

    def test_broken_cycle_yields_no_finding(self):
        """A -> B -> C -> D does not return to A."""
        transactions = [
            tx("C1", "ACC_1", "ACC_2", 20000, 0),
            tx("C2", "ACC_2", "ACC_3", 19500, 10),
            tx("C3", "ACC_3", "ACC_4", 19000, 25),
        ]
        findings = detect_circular_transfers(transactions)
        self.assertEqual(findings, [])

    def test_excessive_hop_delay_yields_no_finding(self):
        """Hop delay (90s) exceeds max_hop_delay_seconds (60s)."""
        config = CircularConfig(max_hop_delay_seconds=60, max_cycle_duration_seconds=300)
        transactions = [
            tx("C1", "ACC_1", "ACC_2", 20000, 0),
            tx("C2", "ACC_2", "ACC_3", 19500, 95),  # 95s > 60s
            tx("C3", "ACC_3", "ACC_1", 19000, 105),
        ]
        findings = detect_circular_transfers(transactions, config=config)
        self.assertEqual(findings, [])

    def test_insufficient_retention_yields_no_finding(self):
        """Only 20% returned; below min_amount_retention_ratio (70%)."""
        config = CircularConfig(min_amount_retention_ratio=0.70)
        transactions = [
            tx("C1", "ACC_1", "ACC_2", 20000, 0),
            tx("C2", "ACC_2", "ACC_3", 19500, 10),
            tx("C3", "ACC_3", "ACC_1", 4000, 25),  # 4000 / 20000 = 0.20
        ]
        findings = detect_circular_transfers(transactions, config=config)
        self.assertEqual(findings, [])

    def test_legitimate_counterexample_merchant_refund(self):
        """Legitimate counterexample: Customer buys from Merchant, receives refund days later.
        Because refunds typically take hours or days (exceeding demo max_hop_delay_seconds),
        the fast-velocity rule does not flag them as fraudulent round-trips.
        """
        config = CircularConfig.demo_preset()
        transactions = [
            tx("BUY_01", "CUSTOMER_42", "MERCHANT_STORE", 4999, 0),
            # Refund arrives 3 days later (259,200s > 60s max hop delay)
            tx("REFUND_01", "MERCHANT_STORE", "CUSTOMER_42", 4999, 259200),
        ]
        findings = detect_circular_transfers(transactions, config=config)
        self.assertEqual(findings, [], "Legitimate delayed e-commerce refund must not trigger rapid circular alert.")


if __name__ == "__main__":
    unittest.main()
