import csv
import unittest
from pathlib import Path

from aml_baseline.dataset import AML_DATA_DIR
from aml_baseline.features import (
    FEATURE_COLUMNS,
    AmlTransaction,
    FeatureInputError,
    compute_features_for_target,
    to_feature_vector,
)

DATA_PRESENT = (AML_DATA_DIR / "train_transactions.csv").exists()


def _load_transactions(path: Path) -> list[AmlTransaction]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [
            AmlTransaction(
                id=row["id"],
                sender=row["sender"],
                receiver=row["receiver"],
                amount_paise=int(row["amount_paise"]),
                timestamp=row["timestamp"],
                payment_format=row["payment_format"],
            )
            for row in reader
        ]


def _load_feature_rows(path: Path) -> dict[str, dict[str, float]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames is not None
        assert reader.fieldnames[1:] == FEATURE_COLUMNS, "provided features CSV header order has drifted"
        rows = {}
        for row in reader:
            rows[row["id"]] = {name: float(row[name]) for name in FEATURE_COLUMNS}
        return rows


def _row(sender="A", receiver="B", amount_paise=100, timestamp="2022-09-01T00:00:00Z", payment_format="ACH", tx_id="T"):
    return AmlTransaction(id=tx_id, sender=sender, receiver=receiver, amount_paise=amount_paise, timestamp=timestamp, payment_format=payment_format)


class FeatureColumnsTests(unittest.TestCase):
    @unittest.skipUnless(DATA_PRESENT, "ml/data/aml/splits not populated; see data/aml/README.md")
    def test_declared_order_matches_supplied_features_header(self):
        with (AML_DATA_DIR / "train_features.csv").open(encoding="utf-8") as handle:
            header = handle.readline().strip().split(",")
        self.assertEqual(header[1:], FEATURE_COLUMNS)


class ParityWithSuppliedFeaturesTests(unittest.TestCase):
    """Proves this project's online feature computation reproduces the
    dataset's own supplied features exactly, for representative rows --
    the "offline and inference feature calculations agree" requirement."""

    @classmethod
    def setUpClass(cls):
        if not DATA_PRESENT:
            raise unittest.SkipTest("ml/data/aml/splits not populated; see data/aml/README.md")
        cls.train_transactions = _load_transactions(AML_DATA_DIR / "train_transactions.csv")
        cls.train_features = _load_feature_rows(AML_DATA_DIR / "train_features.csv")

    def test_reproduces_supplied_features_for_late_train_rows(self):
        # Rows late in the split have substantial history -- the most
        # demanding case for the rolling-window logic.
        by_id = {tx.id: tx for tx in self.train_transactions}
        ordered = sorted(self.train_transactions, key=lambda t: (t.timestamp, t.id))
        sample = ordered[-25:]

        for target in sample:
            expected = self.train_features[target.id]
            actual = compute_features_for_target(target, self.train_transactions)
            for name in FEATURE_COLUMNS:
                self.assertAlmostEqual(
                    actual[name],
                    expected[name],
                    places=6,
                    msg=f"mismatch on {target.id}.{name}: got {actual[name]}, expected {expected[name]}",
                )

    def test_reproduces_supplied_features_for_a_spread_sample(self):
        ordered = sorted(self.train_transactions, key=lambda t: (t.timestamp, t.id))
        n = len(ordered)
        sample_indices = [n // 4, n // 2, (3 * n) // 4, n - 1]
        for index in sample_indices:
            target = ordered[index]
            expected = self.train_features[target.id]
            actual = compute_features_for_target(target, self.train_transactions)
            for name in FEATURE_COLUMNS:
                self.assertAlmostEqual(actual[name], expected[name], places=6, msg=f"{target.id}.{name}")


class ExclusionRuleTests(unittest.TestCase):
    """Same-minute and future-transaction exclusion, independent of the
    supplied dataset (so these run even without ml/data/aml/ populated)."""

    def test_same_minute_transactions_do_not_see_each_other(self):
        t1 = _row(tx_id="T1", sender="A", receiver="B", timestamp="2022-09-01T00:00:00Z")
        t2 = _row(tx_id="T2", sender="A", receiver="C", timestamp="2022-09-01T00:00:00Z")
        features = compute_features_for_target(t2, [t1])
        self.assertEqual(features["sender_out_1h_count"], 0)
        self.assertEqual(features["sender_has_prior_activity"], 0)
        self.assertEqual(features["pair_prior_count"], 0)

    def test_strictly_earlier_transaction_is_observed(self):
        earlier = _row(tx_id="T1", sender="A", receiver="B", timestamp="2022-09-01T00:00:00Z", amount_paise=500)
        later = _row(tx_id="T2", sender="A", receiver="C", timestamp="2022-09-01T00:01:00Z")
        features = compute_features_for_target(later, [earlier])
        self.assertEqual(features["sender_out_1h_count"], 1)
        self.assertEqual(features["sender_out_1h_amount_paise"], 500)
        self.assertEqual(features["sender_has_prior_activity"], 1)
        self.assertEqual(features["sender_seconds_since_prior_activity"], 60)

    def test_future_transaction_is_never_observed(self):
        target = _row(tx_id="T1", sender="A", receiver="B", timestamp="2022-09-01T00:00:00Z")
        future = _row(tx_id="T2", sender="A", receiver="C", timestamp="2022-09-01T00:05:00Z", amount_paise=999)
        features = compute_features_for_target(target, [future])
        self.assertEqual(features["sender_out_1h_count"], 0)
        self.assertEqual(features["sender_has_prior_activity"], 0)

    def test_window_expires_events_older_than_the_window(self):
        old = _row(tx_id="T1", sender="A", receiver="B", timestamp="2022-09-01T00:00:00Z", amount_paise=100)
        target = _row(tx_id="T2", sender="A", receiver="C", timestamp="2022-09-01T02:00:00Z")  # 2h later
        features = compute_features_for_target(target, [old])
        self.assertEqual(features["sender_out_1h_count"], 0)  # expired from the 1h window
        self.assertEqual(features["sender_out_24h_count"], 1)  # still within 24h
        # has_prior_activity is not window-bound -- the account was active before, period.
        self.assertEqual(features["sender_has_prior_activity"], 1)

    def test_pair_prior_count_is_directional_and_pairwise(self):
        ab = _row(tx_id="T1", sender="A", receiver="B", timestamp="2022-09-01T00:00:00Z")
        ba = _row(tx_id="T2", sender="B", receiver="A", timestamp="2022-09-01T00:01:00Z")
        target = _row(tx_id="T3", sender="A", receiver="B", timestamp="2022-09-01T00:02:00Z")
        features = compute_features_for_target(target, [ab, ba])
        # Only the A->B prior transaction counts toward A->B's pair_prior_count.
        self.assertEqual(features["pair_prior_count"], 1)


class UnseenAccountTests(unittest.TestCase):
    def test_brand_new_accounts_get_documented_no_history_defaults(self):
        target = _row(tx_id="T1", sender="NEW_A", receiver="NEW_B", timestamp="2022-09-01T00:00:00Z")
        features = compute_features_for_target(target, [])
        self.assertEqual(features["sender_has_prior_activity"], 0)
        self.assertEqual(features["sender_seconds_since_prior_activity"], -1)
        self.assertEqual(features["receiver_has_prior_activity"], 0)
        self.assertEqual(features["receiver_seconds_since_prior_activity"], -1)
        for role in ("sender", "receiver"):
            for direction in ("out", "in"):
                for hours in (1, 24):
                    prefix = f"{role}_{direction}_{hours}h"
                    self.assertEqual(features[f"{prefix}_count"], 0)
                    self.assertEqual(features[f"{prefix}_distinct_accounts"], 0)
                    self.assertEqual(features[f"{prefix}_amount_paise"], 0)
        self.assertEqual(features["pair_prior_count"], 0)


class MalformedInputTests(unittest.TestCase):
    def test_bad_timestamp_raises(self):
        target = _row(tx_id="T1", timestamp="not-a-timestamp")
        with self.assertRaises(FeatureInputError):
            compute_features_for_target(target, [])


class FeatureVectorOrderTests(unittest.TestCase):
    def test_to_feature_vector_matches_declared_column_order(self):
        target = _row()
        feature = compute_features_for_target(target, [])
        vector = to_feature_vector(feature)
        self.assertEqual(len(vector), len(FEATURE_COLUMNS))
        for name, value in zip(FEATURE_COLUMNS, vector):
            self.assertEqual(value, feature[name])


if __name__ == "__main__":
    unittest.main(verbosity=2)
