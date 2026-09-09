"""Tests for scripts/prepare_aml_dataset.py.

Requires pandas (ml/requirements.txt) -- run with the ml/ venv:

    ml/.venv/Scripts/python.exe -m unittest scripts.test_prepare_aml_dataset -v

(or `python -m pytest scripts/test_prepare_aml_dataset.py -v` from the repo
root with that same interpreter).

The parity tests below don't need the raw IBM source file (never checked
into git, and this project never fetches it automatically) -- they instead
verify `causal_features` against the *already-prepared and committed*
`ml/data/aml/splits/*.csv` files, self-skipping if those aren't present
locally (same convention as `ml/aml_baseline/tests`).
"""

from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import pandas as pd  # noqa: E402

import prepare_aml_dataset as prep  # noqa: E402

SPLITS_DIR = REPO_ROOT / "ml" / "data" / "aml" / "splits"
SPLITS_PRESENT = (SPLITS_DIR / "train_transactions.csv").exists()
requires_splits = unittest.skipUnless(SPLITS_PRESENT, f"{SPLITS_DIR} not populated -- run scripts/prepare_aml_dataset.py first")


class ExactPaiseTests(unittest.TestCase):
    def test_converts_a_clean_two_decimal_amount(self):
        self.assertEqual(prep.exact_paise("753279.46"), 75327946)

    def test_converts_a_whole_rupee_amount(self):
        self.assertEqual(prep.exact_paise("100"), 10000)

    def test_rejects_more_than_two_decimal_places(self):
        with self.assertRaises(prep.SourceValidationError):
            prep.exact_paise("1.005")

    def test_rejects_zero(self):
        with self.assertRaises(prep.SourceValidationError):
            prep.exact_paise("0")

    def test_rejects_negative(self):
        with self.assertRaises(prep.SourceValidationError):
            prep.exact_paise("-5.00")

    def test_never_uses_binary_float_rounding(self):
        # 0.1 + 0.2 style binary-float error must never leak in -- Decimal
        # arithmetic throughout, verified against a value chosen specifically
        # because 19.99 * 100 in IEEE-754 float is 1998.9999999999998, not 1999.
        self.assertEqual(prep.exact_paise("19.99"), 1999)
        self.assertNotEqual(19.99 * 100, 1999)  # documents the float pitfall this avoids


class SplitForTests(unittest.TestCase):
    def test_before_benchmark_start_is_outside_primary_period(self):
        self.assertEqual(prep.split_for("2022-08-31T23:59:00Z"), "outside_primary_period")

    def test_train_boundary(self):
        self.assertEqual(prep.split_for("2022-09-01T00:00:00Z"), "train")
        self.assertEqual(prep.split_for("2022-09-06T23:59:00Z"), "train")

    def test_validation_boundary(self):
        self.assertEqual(prep.split_for("2022-09-07T00:00:00Z"), "validation")
        self.assertEqual(prep.split_for("2022-09-08T23:59:00Z"), "validation")

    def test_test_boundary(self):
        self.assertEqual(prep.split_for("2022-09-09T00:00:00Z"), "test")
        self.assertEqual(prep.split_for("2022-09-10T23:59:00Z"), "test")

    def test_at_and_after_benchmark_end_is_outside_primary_period(self):
        self.assertEqual(prep.split_for("2022-09-11T00:00:00Z"), "outside_primary_period")


class NormalizeValidationTests(unittest.TestCase):
    def _row(self, **overrides):
        row = {
            "Timestamp": "2022/09/01 00:00", "From Bank": "12", "Account": "A1",
            "To Bank": "16", "Account.1": "A2", "Amount Received": "100.00",
            "Receiving Currency": "Rupee", "Amount Paid": "100.00",
            "Payment Currency": "Rupee", "Payment Format": "ACH", "Is Laundering": "0",
            "source_row": 1,
        }
        row.update(overrides)
        return row

    def test_accepts_a_valid_row(self):
        frame = pd.DataFrame([self._row()])
        result = prep.normalize(frame)
        self.assertEqual(result.iloc[0]["id"], "IBM_HIS_V8_000000001")
        self.assertEqual(result.iloc[0]["amount_paise"], 10000)
        self.assertEqual(result.iloc[0]["timestamp"], "2022-09-01T00:00:00Z")
        self.assertEqual(result.iloc[0]["sender"], "IBM_HIS_V8:B12:AA1")

    def test_rejects_mismatched_paid_and_received(self):
        frame = pd.DataFrame([self._row(**{"Amount Paid": "100.00", "Amount Received": "99.00"})])
        with self.assertRaises(prep.SourceValidationError):
            prep.normalize(frame)

    def test_rejects_non_binary_laundering_label(self):
        frame = pd.DataFrame([self._row(**{"Is Laundering": "2"})])
        with self.assertRaises(prep.SourceValidationError):
            prep.normalize(frame)

    def test_rejects_non_rupee_currency(self):
        frame = pd.DataFrame([self._row(**{"Payment Currency": "US Dollar"})])
        with self.assertRaises(prep.SourceValidationError):
            prep.normalize(frame)


class SchemaValidationTests(unittest.TestCase):
    def test_rejects_wrong_columns(self, tmp_path=None):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.csv"
            pd.DataFrame({"a": [1], "b": [2]}).to_csv(bad, index=False)
            with self.assertRaises(prep.SourceValidationError):
                list(prep.read_source_chunks(bad))


class SourceHashTests(unittest.TestCase):
    def test_rejects_a_file_that_does_not_match_the_pinned_hash(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            wrong = Path(tmp) / "wrong.csv"
            wrong.write_text("not the real dataset", encoding="utf-8")
            with self.assertRaises(prep.SourceValidationError):
                prep.verify_source_hash(wrong)


@requires_splits
class CausalFeaturesParityTests(unittest.TestCase):
    """Proves this script's causal_features reproduces the exact values
    already committed in ml/data/aml/splits/train_features.csv -- without
    needing the 475MB raw IBM source file, by recomputing over a
    from-the-start prefix of the already-prepared, already-sorted
    transactions (causality only looks backward, so a prefix taken from the
    very first transaction has complete history for everything in it)."""

    @classmethod
    def setUpClass(cls):
        cls.transactions = pd.read_csv(SPLITS_DIR / "train_transactions.csv", dtype={"amount_paise": "int64"})
        cls.expected_features = pd.read_csv(SPLITS_DIR / "train_features.csv")

    def test_reproduces_a_prefix_of_the_real_committed_features_exactly(self):
        prefix_size = 500
        prefix = self.transactions.iloc[:prefix_size]
        computed = prep.causal_features(prefix)
        expected = self.expected_features.iloc[:prefix_size].reset_index(drop=True)

        self.assertEqual(list(computed.columns), list(expected.columns))
        self.assertEqual(list(computed["id"]), list(expected["id"]))

        numeric_columns = [c for c in expected.columns if c != "id"]
        pd.testing.assert_frame_equal(
            computed[numeric_columns].reset_index(drop=True),
            expected[numeric_columns].reset_index(drop=True),
            check_exact=False,
            atol=1e-9,
        )

    def test_never_reads_the_label_column(self):
        with_label = self.transactions.iloc[:5].copy()
        with_label["is_laundering"] = 0
        with self.assertRaises(prep.SourceValidationError):
            prep.causal_features(with_label)


if __name__ == "__main__":
    unittest.main()
