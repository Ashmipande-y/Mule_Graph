import unittest

from aml_baseline.dataset import load_split, AML_DATA_DIR
from aml_baseline.features import AmlTransaction
from aml_baseline.inference import DEFAULT_MODEL_PATH, load_model, score_features, score_transactions

MODEL_PRESENT = DEFAULT_MODEL_PATH.exists()
DATA_PRESENT = (AML_DATA_DIR / "train_transactions.csv").exists()


def _tx(tx_id, sender="A", receiver="B", amount_paise=1000, timestamp="2022-09-01T00:00:00Z", payment_format="ACH"):
    return AmlTransaction(id=tx_id, sender=sender, receiver=receiver, amount_paise=amount_paise, timestamp=timestamp, payment_format=payment_format)


@unittest.skipUnless(MODEL_PRESENT, "model not trained yet; run ml/scripts/run_aml_baseline.py first")
class LoadModelTests(unittest.TestCase):
    def test_loaded_model_exposes_version_threshold_and_columns(self):
        loaded = load_model()
        self.assertEqual(loaded.model_version, "aml_baseline_v1")
        self.assertTrue(0.0 <= loaded.threshold <= 1.0)
        self.assertGreater(len(loaded.feature_columns), 0)

    def test_missing_model_file_raises_file_not_found(self):
        from pathlib import Path

        with self.assertRaises(FileNotFoundError):
            load_model(Path("does_not_exist.joblib"))


@unittest.skipUnless(MODEL_PRESENT and DATA_PRESENT, "model or dataset not available")
class ScoreTransactionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loaded = load_model()
        cls.test_split = load_split("test")

    def test_single_transaction_score_is_in_unit_interval(self):
        target = _tx("NEW_1")
        results = score_transactions(self.loaded, [target], history=[])
        self.assertEqual(len(results), 1)
        self.assertTrue(0.0 <= results[0].score <= 1.0)
        self.assertEqual(results[0].transaction_id, "NEW_1")
        self.assertEqual(results[0].model_version, "aml_baseline_v1")

    def test_is_laundering_matches_threshold(self):
        target = _tx("NEW_1")
        result = score_transactions(self.loaded, [target], history=[])[0]
        self.assertEqual(result.is_laundering, result.score >= result.threshold)

    def test_batch_result_order_matches_request_order_not_chronological_order(self):
        later = _tx("LATER", timestamp="2022-09-01T01:00:00Z")
        earlier = _tx("EARLIER", timestamp="2022-09-01T00:00:00Z")
        results = score_transactions(self.loaded, [later, earlier], history=[])
        self.assertEqual([r.transaction_id for r in results], ["LATER", "EARLIER"])

    def test_batch_transaction_sees_earlier_batch_sibling_as_history(self):
        # Two proposed transactions from the same new account, 10 minutes
        # apart: the second should see the first as prior activity, exactly
        # as if it had been assessed one at a time after committing the first.
        first = _tx("B1", sender="FRESH_X", receiver="FRESH_Y", timestamp="2022-09-01T00:00:00Z")
        second = _tx("B2", sender="FRESH_X", receiver="FRESH_Z", timestamp="2022-09-01T00:10:00Z")
        results = score_transactions(self.loaded, [first, second], history=[])
        by_id = {r.transaction_id: r for r in results}
        self.assertEqual(by_id["B1"].features["sender_has_prior_activity"], 0)
        self.assertEqual(by_id["B2"].features["sender_has_prior_activity"], 1)
        self.assertEqual(by_id["B2"].features["sender_out_1h_count"], 1)

    def test_same_minute_batch_siblings_do_not_see_each_other(self):
        a = _tx("C1", sender="FRESH_Q", receiver="FRESH_R", timestamp="2022-09-01T00:00:00Z")
        b = _tx("C2", sender="FRESH_Q", receiver="FRESH_S", timestamp="2022-09-01T00:00:00Z")
        results = score_transactions(self.loaded, [a, b], history=[])
        by_id = {r.transaction_id: r for r in results}
        self.assertEqual(by_id["C1"].features["sender_has_prior_activity"], 0)
        self.assertEqual(by_id["C2"].features["sender_has_prior_activity"], 0)

    def test_committed_history_is_not_mutated_by_scoring(self):
        history = [_tx("H1")]
        history_copy = list(history)
        score_transactions(self.loaded, [_tx("NEW_2")], history=history)
        self.assertEqual(history, history_copy)

    def test_score_features_rejects_column_mismatch(self):
        import pandas as pd

        bad = pd.DataFrame([{"wrong_column": 1.0}])
        with self.assertRaises(ValueError):
            score_features(self.loaded, bad)


if __name__ == "__main__":
    unittest.main(verbosity=2)
