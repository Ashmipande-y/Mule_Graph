import unittest

import numpy as np

from xgb_baseline.evaluate import choose_threshold_by_f1, compute_report


class ComputeReportTests(unittest.TestCase):
    def test_perfect_separation(self):
        y_true = [0, 0, 0, 1, 1]
        y_prob = [0.1, 0.2, 0.3, 0.9, 0.95]
        report = compute_report(y_true, y_prob, threshold=0.5)
        self.assertEqual(report.precision, 1.0)
        self.assertEqual(report.recall, 1.0)
        self.assertEqual(report.f1, 1.0)
        self.assertEqual(report.support_positive, 2)
        self.assertEqual(report.support_negative, 3)
        self.assertEqual(report.confusion_matrix, [[3, 0], [0, 2]])

    def test_single_class_split_reports_undefined_honestly(self):
        y_true = [0, 0, 0, 0]
        y_prob = [0.1, 0.2, 0.05, 0.4]
        report = compute_report(y_true, y_prob, threshold=0.5)
        self.assertIsNone(report.roc_auc)
        self.assertIsNotNone(report.roc_auc_undefined_reason)
        self.assertEqual(report.support_positive, 0)

    def test_threshold_changes_predictions(self):
        y_true = [0, 1]
        y_prob = [0.4, 0.6]
        low = compute_report(y_true, y_prob, threshold=0.3)
        high = compute_report(y_true, y_prob, threshold=0.9)
        self.assertEqual(low.confusion_matrix, [[0, 1], [0, 1]])  # both predicted positive
        self.assertEqual(high.confusion_matrix, [[1, 0], [1, 0]])  # both predicted negative


class ChooseThresholdTests(unittest.TestCase):
    def test_picks_threshold_maximizing_validation_f1(self):
        rng = np.random.default_rng(0)
        y_val = np.array([0] * 90 + [1] * 10)
        # Scores strongly correlated with label but not perfectly separable.
        y_val_prob = np.concatenate([rng.uniform(0, 0.6, 90), rng.uniform(0.4, 1.0, 10)])
        threshold = choose_threshold_by_f1(y_val, y_val_prob)
        self.assertGreaterEqual(threshold, 0.01)
        self.assertLessEqual(threshold, 0.99)

        # The chosen threshold must not be worse (by F1) than a coarse sweep.
        from sklearn.metrics import f1_score

        chosen_f1 = f1_score(y_val, (y_val_prob >= threshold).astype(int))
        for candidate in np.linspace(0.05, 0.95, 19):
            candidate_f1 = f1_score(y_val, (y_val_prob >= candidate).astype(int))
            self.assertLessEqual(candidate_f1, chosen_f1 + 1e-9)


if __name__ == "__main__":
    unittest.main()
