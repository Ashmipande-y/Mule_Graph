import unittest

import pandas as pd

from xgb_baseline.features import FEATURE_COLUMNS, extract_features


def _row(time=3661.0, amount=10.0, **v_overrides):
    row = {"Time": time, "Amount": amount}
    for i in range(1, 29):
        row[f"V{i}"] = v_overrides.get(f"V{i}", 0.0)
    return row


class ExtractFeaturesTests(unittest.TestCase):
    def test_output_columns_match_declared_order(self):
        df = pd.DataFrame([_row()])
        features = extract_features(df)
        self.assertEqual(list(features.columns), FEATURE_COLUMNS)

    def test_hour_of_window_wraps_at_24_hours(self):
        # Time=3661s = 1h 1m 1s past midnight of *some* day in the window.
        df = pd.DataFrame([_row(time=3661.0), _row(time=3661.0 + 86400)])
        features = extract_features(df)
        # Both rows are the same time-of-day, one day apart -- must produce
        # the same hour_of_window value (that's the point of the feature).
        self.assertAlmostEqual(features["hour_of_window"].iloc[0], features["hour_of_window"].iloc[1], places=9)
        self.assertAlmostEqual(features["hour_of_window"].iloc[0], 1.0169444444, places=6)

    def test_raises_on_missing_column(self):
        df = pd.DataFrame([{"Time": 0.0, "Amount": 1.0}])  # missing V1..V28
        with self.assertRaises(ValueError):
            extract_features(df)

    def test_is_stateless_across_calls(self):
        # Calling twice on the same input must be identical -- no fitted state.
        df = pd.DataFrame([_row(time=100.0, amount=50.0)])
        first = extract_features(df)
        second = extract_features(df)
        pd.testing.assert_frame_equal(first, second)


if __name__ == "__main__":
    unittest.main()
