import datetime
import unittest

from rules.forwarding import ForwardingChainConfig, detect_forwarding_chains
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


class ForwardingChainTests(unittest.TestCase):
    def test_positive_three_hop_forwarding_chain(self):
        """A -> B -> C -> D linear pass-through chain."""
        transactions = [
            tx("F1", "ACC_A", "ACC_B", 50000, 0),
            tx("F2", "ACC_B", "ACC_C", 48000, 8),
            tx("F3", "ACC_C", "ACC_D", 46000, 18),
        ]
        findings = detect_forwarding_chains(transactions)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual(f.pattern, "rapid_forwarding")
        self.assertEqual(f.involved_accounts, ("ACC_A", "ACC_B", "ACC_C", "ACC_D"))
        self.assertEqual(f.evidence_transaction_ids, ("F1", "F2", "F3"))
        self.assertAlmostEqual(f.measured_signals["pass_through_ratio"], 0.92, places=2)
        self.assertEqual(f.measured_signals["hops"], 3)
        self.assertIn("Rapid forwarding chain detected", f.explanation)

    def test_too_short_chain_yields_no_finding(self):
        """A -> B -> C is only 2 hops, below min_hops=3."""
        transactions = [
            tx("F1", "ACC_A", "ACC_B", 50000, 0),
            tx("F2", "ACC_B", "ACC_C", 48000, 8),
        ]
        findings = detect_forwarding_chains(transactions)
        self.assertEqual(findings, [])

    def test_excessive_hop_delay_breaks_chain(self):
        """Intermediate hop delay (90s) exceeds max_hop_delay_seconds=60."""
        transactions = [
            tx("F1", "ACC_A", "ACC_B", 50000, 0),
            tx("F2", "ACC_B", "ACC_C", 48000, 100),  # 100s > 60s delay
            tx("F3", "ACC_C", "ACC_D", 46000, 110),
        ]
        findings = detect_forwarding_chains(transactions)
        self.assertEqual(findings, [])

    def test_low_pass_through_ratio_breaks_chain(self):
        """Intermediary spends majority locally; pass-through ratio 40% < 75%."""
        transactions = [
            tx("F1", "ACC_A", "ACC_B", 50000, 0),
            tx("F2", "ACC_B", "ACC_C", 20000, 10),  # 20000/50000 = 0.40 < 0.75
            tx("F3", "ACC_C", "ACC_D", 19000, 20),
        ]
        findings = detect_forwarding_chains(transactions)
        self.assertEqual(findings, [])

    def test_legitimate_counterexample_retail_merchant_settlement(self):
        """Legitimate counterexample: Customer pays Retailer, Retailer pays Supplier days later.
        The extended time between wholesale restocking and customer checkout prevents false alerts.
        """
        config = ForwardingChainConfig.demo_preset()
        transactions = [
            tx("PAY_01", "BUYER", "RETAILER", 10000, 0),
            # Retailer replenishes stock via wholesale wire 2 days later
            tx("RESTOCK_01", "RETAILER", "SUPPLIER", 9000, 172800),
            tx("SUPPLY_01", "SUPPLIER", "MANUFACTURER", 8500, 345600),
        ]
        findings = detect_forwarding_chains(transactions, config=config)
        self.assertEqual(findings, [], "Normal business inventory procurement cycle must not trigger rapid forwarding.")


if __name__ == "__main__":
    unittest.main()
