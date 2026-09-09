import tempfile
import unittest
from pathlib import Path

import pandas as pd

from aml_baseline.dataset import AML_DATA_DIR, DatasetIntegrityError, load_all_splits, load_split
from aml_baseline.features import FEATURE_COLUMNS

DATA_PRESENT = (AML_DATA_DIR / "train_transactions.csv").exists()


@unittest.skipUnless(DATA_PRESENT, "ml/data/aml/splits not populated; see data/aml/README.md")
class LoadSplitTests(unittest.TestCase):
    def test_train_split_matches_documented_counts(self):
        split = load_split("train")
        self.assertEqual(len(split.features), 16666)
        self.assertEqual(int(split.labels.sum()), 83)

    def test_validation_split_matches_documented_counts(self):
        split = load_split("validation")
        self.assertEqual(len(split.features), 5345)
        self.assertEqual(int(split.labels.sum()), 25)

    def test_test_split_matches_documented_counts(self):
        split = load_split("test")
        self.assertEqual(len(split.features), 5479)
        self.assertEqual(int(split.labels.sum()), 18)

    def test_features_have_exactly_the_declared_columns_in_order(self):
        split = load_split("train")
        self.assertEqual(list(split.features.columns), FEATURE_COLUMNS)
        self.assertNotIn("id", split.features.columns)

    def test_ids_features_and_labels_are_positionally_aligned(self):
        split = load_split("train")
        self.assertEqual(len(split.ids), len(split.features))
        self.assertEqual(len(split.ids), len(split.labels))

    def test_load_all_splits_returns_all_three(self):
        splits = load_all_splits()
        self.assertEqual(set(splits), {"train", "validation", "test"})

    def test_unknown_split_name_raises(self):
        with self.assertRaises(ValueError):
            load_split("bogus")


class IntegrityCheckTests(unittest.TestCase):
    """Synthetic, self-contained fixtures -- run regardless of whether the real dataset is populated."""

    def _write_split(self, tmp_dir: Path, transactions: list[dict], features: list[dict], labels: list[dict]):
        # Uses the "train" split name (an isolated tmp_dir, never the real
        # data) since load_split validates its name argument against the
        # real SPLITS tuple.
        pd.DataFrame(transactions).to_csv(tmp_dir / "train_transactions.csv", index=False)
        pd.DataFrame(features).to_csv(tmp_dir / "train_features.csv", index=False)
        pd.DataFrame(labels).to_csv(tmp_dir / "train_labels.csv", index=False)

    def _base_row(self, tx_id: str) -> dict:
        row = {name: 0.0 for name in FEATURE_COLUMNS}
        row["id"] = tx_id
        return row

    def test_raises_on_id_present_in_transactions_but_missing_from_features(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_split(
                tmp_dir,
                transactions=[{"id": "T1", "sender": "A", "receiver": "B", "amount_paise": 100, "currency": "INR", "timestamp": "2022-09-01T00:00:00Z", "payment_format": "ACH"}],
                features=[self._base_row("T2")],  # T1 missing here, an unrelated id present instead
                labels=[{"id": "T1", "is_laundering": 0}],
            )
            with self.assertRaises(DatasetIntegrityError):
                load_split("train", data_dir=tmp_dir)

    def test_raises_on_duplicate_id_within_a_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_split(
                tmp_dir,
                transactions=[
                    {"id": "T1", "sender": "A", "receiver": "B", "amount_paise": 100, "currency": "INR", "timestamp": "2022-09-01T00:00:00Z", "payment_format": "ACH"},
                    {"id": "T1", "sender": "A", "receiver": "C", "amount_paise": 200, "currency": "INR", "timestamp": "2022-09-01T00:01:00Z", "payment_format": "ACH"},
                ],
                features=[self._base_row("T1"), self._base_row("T1")],
                labels=[{"id": "T1", "is_laundering": 0}, {"id": "T1", "is_laundering": 0}],
            )
            with self.assertRaises(DatasetIntegrityError):
                load_split("train", data_dir=tmp_dir)


if __name__ == "__main__":
    unittest.main(verbosity=2)
