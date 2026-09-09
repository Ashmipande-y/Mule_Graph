import datetime
import unittest
from pathlib import Path

from rules.replay import evaluate_at, observable_transactions
from rules.transactions import load_transactions

REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_TRANSACTIONS_PATH = REPO_ROOT / "data" / "demo_transactions.json"

UTC = datetime.timezone.utc


class ObservableTransactionsTests(unittest.TestCase):
    def setUp(self):
        self.transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)

    def test_filters_to_timestamp_and_earlier(self):
        as_of = datetime.datetime(2026, 1, 1, 10, 0, 10, tzinfo=UTC)  # exactly TX_004's timestamp
        snapshot = observable_transactions(self.transactions, as_of)
        self.assertEqual([t.id for t in snapshot], ["TX_001", "TX_002", "TX_003", "TX_004"])

    def test_empty_snapshot_before_any_transaction(self):
        as_of = datetime.datetime(2026, 1, 1, 9, 59, 59, tzinfo=UTC)
        snapshot = observable_transactions(self.transactions, as_of)
        self.assertEqual(snapshot, [])

    def test_full_snapshot_after_last_transaction(self):
        as_of = datetime.datetime(2026, 1, 1, 11, 0, 0, tzinfo=UTC)
        snapshot = observable_transactions(self.transactions, as_of)
        self.assertEqual(len(snapshot), 7)

    def test_rejects_naive_as_of(self):
        naive = datetime.datetime(2026, 1, 1, 10, 0, 10)
        with self.assertRaises(ValueError):
            observable_transactions(self.transactions, naive)


class ReplayNoFutureLeakageTests(unittest.TestCase):
    """The core replay guarantee: a snapshot taken before the convergence
    transactions happened must not be able to see them, and therefore must
    not report the pattern that only exists because of them."""

    def setUp(self):
        self.transactions = load_transactions(CANONICAL_TRANSACTIONS_PATH)

    def test_no_finding_before_any_convergence_transaction(self):
        # TX_004 (the last fan-out transaction) just happened; TX_005/006/007
        # (convergence) have not happened yet from this snapshot's point of view.
        as_of = datetime.datetime(2026, 1, 1, 10, 0, 10, tzinfo=UTC)
        findings = evaluate_at(self.transactions, as_of)
        self.assertEqual(findings, [])

    def test_finding_appears_once_convergence_is_observable(self):
        as_of = datetime.datetime(2026, 1, 1, 10, 0, 21, tzinfo=UTC)  # exactly TX_007's timestamp
        findings = evaluate_at(self.transactions, as_of)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].collector_account, "ACC_X")

    def test_partial_convergence_is_insufficient(self):
        # Only two of the three convergence transactions have happened yet;
        # default min_intermediaries is 3, so no finding should fire.
        as_of = datetime.datetime(2026, 1, 1, 10, 0, 18, tzinfo=UTC)  # TX_005 and TX_006 observable, not TX_007
        findings = evaluate_at(self.transactions, as_of)
        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
