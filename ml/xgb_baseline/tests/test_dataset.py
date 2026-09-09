import tempfile
import unittest
from pathlib import Path

import pandas as pd

from xgb_baseline.dataset import (
    DatasetIntegrityError,
    LABEL_COLUMN,
    TIME_COLUMN,
    chronological_split,
    load_raw,
)


class LoadRawTests(unittest.TestCase):
    def test_loads_and_matches_verified_provenance(self):
        df = load_raw()
        self.assertEqual(len(df), 284807)
        self.assertEqual(int((df[LABEL_COLUMN].astype(int) == 1).sum()), 492)

    def test_rejects_wrong_columns(self):
        bad = pd.DataFrame({"a": [1], "b": [2]})
        with tempfile.TemporaryDirectory() as tmp_dir:
            bad_path = Path(tmp_dir) / "bad.parquet"
            bad.to_parquet(bad_path)
            with self.assertRaises(DatasetIntegrityError):
                load_raw(bad_path)

    def test_rejects_wrong_row_count(self):
        real = load_raw()
        truncated = real.iloc[:100]
        with tempfile.TemporaryDirectory() as tmp_dir:
            bad_path = Path(tmp_dir) / "truncated.parquet"
            truncated.to_parquet(bad_path)
            with self.assertRaises(DatasetIntegrityError):
                load_raw(bad_path)

    def test_missing_file_raises_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            load_raw(Path("does_not_exist.parquet"))


class ChronologicalSplitTests(unittest.TestCase):
    def setUp(self):
        self.df = load_raw()

    def test_split_sizes_sum_to_total(self):
        split = chronological_split(self.df)
        total = len(split.train) + len(split.validation) + len(split.test)
        self.assertEqual(total, len(self.df))

    def test_split_is_strictly_chronological(self):
        split = chronological_split(self.df)
        self.assertLessEqual(split.train[TIME_COLUMN].max(), split.validation[TIME_COLUMN].min())
        self.assertLessEqual(split.validation[TIME_COLUMN].max(), split.test[TIME_COLUMN].min())

    def test_every_split_contains_both_classes(self):
        split = chronological_split(self.df)
        for name, part in [("train", split.train), ("validation", split.validation), ("test", split.test)]:
            classes = set(part[LABEL_COLUMN].astype(int).unique())
            self.assertEqual(classes, {0, 1}, f"{name} split is missing a class: {classes}")


if __name__ == "__main__":
    unittest.main()
