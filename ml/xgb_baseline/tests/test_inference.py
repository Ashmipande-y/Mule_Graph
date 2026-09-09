import unittest

import pandas as pd

from xgb_baseline.dataset import LABEL_COLUMN, chronological_split, load_raw
from xgb_baseline.inference import DEFAULT_MODEL_PATH, load_model, predict


@unittest.skipUnless(DEFAULT_MODEL_PATH.exists(), "model not trained yet; run ml/scripts/run_xgb_baseline.py first")
class InferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loaded = load_model()
        df = load_raw()
        cls.test_split = chronological_split(df).test

    def test_predict_returns_score_and_is_fraud_columns(self):
        sample = self.test_split.head(5)
        result = predict(self.loaded, sample)
        self.assertEqual(list(result.columns), ["score", "is_fraud"])
        self.assertEqual(len(result), 5)
        self.assertTrue(((result["score"] >= 0) & (result["score"] <= 1)).all())

    def test_is_fraud_matches_threshold(self):
        sample = self.test_split.head(50)
        result = predict(self.loaded, sample)
        expected = result["score"] >= self.loaded.threshold
        pd.testing.assert_series_equal(result["is_fraud"], expected, check_names=False)

    def test_known_fraud_rows_score_higher_on_average_than_legitimate_rows(self):
        fraud_rows = self.test_split[self.test_split[LABEL_COLUMN].astype(int) == 1]
        legit_rows = self.test_split[self.test_split[LABEL_COLUMN].astype(int) == 0]
        fraud_scores = predict(self.loaded, fraud_rows)["score"]
        legit_scores = predict(self.loaded, legit_rows)["score"]
        self.assertGreater(fraud_scores.mean(), legit_scores.mean())

    def test_raises_on_feature_mismatch(self):
        malformed = self.test_split.drop(columns=["V1"])
        with self.assertRaises(ValueError):
            predict(self.loaded, malformed)

    def test_inference_does_not_import_train_module(self):
        import xgb_baseline.inference as inference_module

        self.assertNotIn("train", inference_module.__dict__)


if __name__ == "__main__":
    unittest.main()
