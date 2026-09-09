import datetime
import unittest

from rules.dormancy import DormancyConfig, detect_dormant_reactivation
from rules.replay import evaluate_all_at
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


class DormancyReactivationTests(unittest.TestCase):
    def test_positive_dormant_reactivation_surge(self):
        """Account idle for 5000s (> 3600s threshold) then bursts with ₹60,000."""
        config = DormancyConfig(
            min_dormancy_seconds=3600,
            burst_window_seconds=60,
            min_burst_tx_count=1,
            min_surge_amount=10000,
            surge_ratio_threshold=2.0,
        )
        transactions = [
            # Prior baseline transaction
            tx("D0", "ACC_SLEEPER", "MERCHANT", 2000, 0),
            # Dormant gap: 5000s later (1.38 hours)
            tx("D1", "EXTERNAL_SOURCE", "ACC_SLEEPER", 35000, 5000),
            tx("D2", "ACC_SLEEPER", "CASH_OUT", 25000, 5020),
        ]
        findings = detect_dormant_reactivation(transactions, config=config)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual(f.pattern, "dormant_reactivation")
        self.assertEqual(f.source_account, "ACC_SLEEPER")
        self.assertEqual(f.measured_signals["inactivity_seconds"], 5000.0)
        self.assertEqual(f.measured_signals["burst_total_amount"], 60000)
        self.assertIn("Unusual reactivation after dormancy", f.explanation)

    def test_inactivity_below_threshold_yields_no_finding(self):
        """Gap is only 1800s (30m), below min_dormancy_seconds=3600s."""
        config = DormancyConfig(min_dormancy_seconds=3600)
        transactions = [
            tx("D0", "ACC_NORMAL", "MERCHANT", 2000, 0),
            tx("D1", "EXT", "ACC_NORMAL", 35000, 1800),
        ]
        findings = detect_dormant_reactivation(transactions, config=config)
        self.assertEqual(findings, [])

    def test_minor_transaction_after_dormancy_yields_no_finding(self):
        """Reactivation is a ₹100 tea purchase, below min_surge_amount=10000."""
        config = DormancyConfig(min_dormancy_seconds=3600, min_surge_amount=10000)
        transactions = [
            tx("D0", "ACC_USER", "SHOP", 500, 0),
            tx("D1", "ACC_USER", "CAFE", 100, 5000),
        ]
        findings = detect_dormant_reactivation(transactions, config=config)
        self.assertEqual(findings, [])

    def test_replay_safety_no_future_leakage(self):
        """Evaluating snapshot at t=2500s (during dormancy) sees NO reactivation."""
        transactions = [
            tx("D0", "ACC_SLEEPER", "MERCHANT", 2000, 0),
            tx("D1", "EXTERNAL_SOURCE", "ACC_SLEEPER", 50000, 5000),
        ]
        # Evaluate as of t=2500s (before reactivation at 5000s)
        as_of = BASE_TIME + datetime.timedelta(seconds=2500)
        findings = evaluate_all_at(transactions, as_of)

        dormancy_findings = [f for f in findings if f.pattern == "dormant_reactivation"]
        self.assertEqual(
            dormancy_findings,
            [],
            "Point-in-time replay before reactivation timestamp must not see future burst.",
        )


if __name__ == "__main__":
    unittest.main()
