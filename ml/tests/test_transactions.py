import datetime
import unittest
from pathlib import Path

from rules.transactions import Transaction, TransactionParseError, deduplicate_by_id, load_transactions

REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_TRANSACTIONS_PATH = REPO_ROOT / "data" / "demo_transactions.json"


class LoadTransactionsTests(unittest.TestCase):
    def test_loads_canonical_fixture(self):
        transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)
        self.assertEqual(len(transactions), 7)
        self.assertEqual([t.id for t in transactions], [f"TX_00{i}" for i in range(1, 8)])
        first = transactions[0]
        self.assertEqual(first.sender, "ACC_VICTIM")
        self.assertEqual(first.receiver, "ACC_A")
        self.assertEqual(first.amount, 50000)
        self.assertEqual(first.timestamp, datetime.datetime(2026, 1, 1, 10, 0, 0, tzinfo=datetime.timezone.utc))

    def test_sorted_by_timestamp_then_id(self):
        transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)
        keys = [(t.timestamp, t.id) for t in transactions]
        self.assertEqual(keys, sorted(keys))

    def test_rejects_boolean_amount(self):
        with self.assertRaises(TransactionParseError):
            Transaction.from_dict(
                {"id": "TX_X", "sender": "A", "receiver": "B", "amount": True, "timestamp": "2026-01-01T10:00:00Z"}
            )

    def test_rejects_invalid_calendar_date(self):
        with self.assertRaises(TransactionParseError):
            Transaction.from_dict(
                {"id": "TX_X", "sender": "A", "receiver": "B", "amount": 100, "timestamp": "2026-02-30T10:00:00Z"}
            )

    def test_deduplicate_by_id_keeps_first_occurrence(self):
        t1 = Transaction.from_dict(
            {"id": "TX_1", "sender": "A", "receiver": "B", "amount": 100, "timestamp": "2026-01-01T10:00:00Z"}
        )
        t1_dup = Transaction.from_dict(
            {"id": "TX_1", "sender": "A", "receiver": "B", "amount": 100, "timestamp": "2026-01-01T10:00:00Z"}
        )
        t2 = Transaction.from_dict(
            {"id": "TX_2", "sender": "A", "receiver": "C", "amount": 200, "timestamp": "2026-01-01T10:00:05Z"}
        )
        deduped = deduplicate_by_id([t1, t1_dup, t2])
        self.assertEqual([t.id for t in deduped], ["TX_1", "TX_2"])


if __name__ == "__main__":
    unittest.main()
