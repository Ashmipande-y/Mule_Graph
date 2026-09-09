import datetime
import unittest

from rules.fan_in import FanInConfig, detect_fan_in
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


class FanInCollectorTests(unittest.TestCase):
    def test_positive_three_sender_fan_in(self):
        """Three distinct senders funneling into one collector in 30s."""
        transactions = [
            tx("I1", "SENDER_A", "COLLECTOR_X", 15000, 0),
            tx("I2", "SENDER_B", "COLLECTOR_X", 14000, 10),
            tx("I3", "SENDER_C", "COLLECTOR_X", 16000, 25),
        ]
        findings = detect_fan_in(transactions)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual(f.pattern, "fan_in_collector")
        self.assertEqual(f.collector_account, "COLLECTOR_X")
        self.assertEqual(f.measured_signals["sender_count"], 3)
        self.assertEqual(f.measured_signals["total_amount"], 45000)
        self.assertEqual(set(f.evidence_transaction_ids), {"I1", "I2", "I3"})
        self.assertIn("Fan-in collector activity detected", f.explanation)

    def test_insufficient_senders_yields_no_finding(self):
        """Only 2 distinct senders, below min_senders=3."""
        transactions = [
            tx("I1", "SENDER_A", "COLLECTOR_X", 15000, 0),
            tx("I2", "SENDER_B", "COLLECTOR_X", 14000, 10),
            tx("I3", "SENDER_A", "COLLECTOR_X", 16000, 20),  # Duplicate sender
        ]
        findings = detect_fan_in(transactions)
        self.assertEqual(findings, [])

    def test_transfers_spread_outside_window_yields_no_finding(self):
        """Senders are spread out over 150s, exceeding 60s sliding window."""
        config = FanInConfig(min_senders=3, fan_in_window_seconds=60)
        transactions = [
            tx("I1", "SENDER_A", "COLLECTOR_X", 15000, 0),
            tx("I2", "SENDER_B", "COLLECTOR_X", 14000, 70),  # 70s > 60s from first
            tx("I3", "SENDER_C", "COLLECTOR_X", 16000, 150),
        ]
        findings = detect_fan_in(transactions, config=config)
        self.assertEqual(findings, [])

    def test_legitimate_counterexample_dinner_bill_split(self):
        """Legitimate counterexample: Dinner bill split among 3 friends.
        While topology is fan-in, transaction notes and small non-round retail sums
        distinguish social expense splitting from high-value mule aggregation.
        """
        config = FanInConfig(min_senders=3, fan_in_window_seconds=60, min_total_amount=100000)
        transactions = [
            tx("SPLIT_01", "FRIEND_1", "HOST", 450, 0),
            tx("SPLIT_02", "FRIEND_2", "HOST", 450, 15),
            tx("SPLIT_03", "FRIEND_3", "HOST", 450, 30),
        ]
        # Below volume threshold min_total_amount for mule consolidation
        findings = detect_fan_in(transactions, config=config)
        self.assertEqual(findings, [], "Small retail dinner split must not be flagged when volume threshold is configured.")


if __name__ == "__main__":
    unittest.main()
