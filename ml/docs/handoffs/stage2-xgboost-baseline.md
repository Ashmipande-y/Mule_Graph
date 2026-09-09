# Stage 2 Handoff: Dataset Preparation and XGBoost Baseline

Date: 2026-09-07
Scope: ML-only, all changes confined to `ml/`. Nothing committed or pushed (per
instruction for this stage) -- everything below is in the working tree.

## 0. Pre-flight: verifying Stage 0/1 before extending

Re-inspected the repo and Stage 1 handoff before starting. Commit `1e278ee`
("feat(ml): add Stage 1 rules/replay fan-out-convergence detector") and the file
paths it lists (`ml/rules/*.py`, `ml/tests/*.py`, `ml/scripts/run_rules_demo.py`,
`ml/docs*/stage1-rules-replay.md`) were checked directly against
`git show --stat 1e278ee` and `find ml -type f` -- all paths matched exactly, no
discrepancy found, nothing needed to be recreated.

Ran the existing rules test suite before touching anything:
```
python -m unittest discover -s ml/tests -t ml
```
Result: 24 tests, all passing. Also re-ran `python scripts/validate_demo.py`:
`OK: canonical demo fixtures valid (6 accounts, 7 transactions, 7 edges)`.

## 1. Files created (all inside `ml/`)

```
ml/.venv/                                   # project-local venv (gitignored)
ml/requirements.txt                         # pinned Stage 2 dependencies
ml/data/raw/creditcard_openml_1597.parquet  # downloaded dataset (gitignored)
ml/xgb_baseline/__init__.py
ml/xgb_baseline/dataset.py                  # load_raw(), chronological_split()
ml/xgb_baseline/features.py                 # extract_features(), FEATURE_COLUMNS
ml/xgb_baseline/train.py                    # train_baseline(), main()
ml/xgb_baseline/evaluate.py                 # compute_report(), choose_threshold_by_f1()
ml/xgb_baseline/inference.py                # load_model(), predict()
ml/xgb_baseline/tests/__init__.py
ml/xgb_baseline/tests/test_dataset.py
ml/xgb_baseline/tests/test_features.py
ml/xgb_baseline/tests/test_evaluate.py
ml/xgb_baseline/tests/test_inference.py
ml/scripts/run_xgb_baseline.py              # CLI entry point
ml/models/xgb_baseline.joblib               # trained model bundle (gitignored)
ml/reports/xgb_baseline_metrics.json        # copy of training/eval metadata
ml/docs/stage2-xgboost-baseline.md          # design doc
ml/docs/handoffs/stage2-xgboost-baseline.md # this file
ml/README.md                                # updated status
```

`ml/rules/`, `ml/tests/`, and everything outside `ml/` (`data/`, `scripts/`,
`docs/` at repo root, `frontend/`, `backend/`) were **not modified**.

**Note for whoever commits this**: `ml/data/raw/`, `ml/.venv/`, and
`ml/models/*.joblib` are already covered by Stage 0's root `.gitignore`.
`ml/reports/xgb_baseline_metrics.json` is **not** currently ignored (verified with
`git check-ignore -v`) -- it's small (a few KB) and arguably worth tracking as a
result summary, but that's a judgment call left to whoever does the actual
commit, since editing the root `.gitignore` is outside this stage's `ml/`-only
scope.

## 2. Dataset acquisition: exact steps and verification

```
curl -sI https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml
```
-> page's embedded JSON-LD: license CDLA-Sharing-1.0, synthetic data, distribution
`"requiresSubscription": true`. No `~/.kaggle/` directory, no `kaggle` pip
package, no API token anywhere in this environment -> **blocked**, confirmed
rather than assumed.

```
curl -sI https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
```
-> same result: `"requiresSubscription": true`, license CC BY-NC-ND 4.0 (more
restrictive than IBM AML) -> also blocked.

Searched Hugging Face and OpenML for genuinely open alternatives. Selected
OpenML dataset id 1597:

```
curl -sI https://data.openml.org/datasets/0000/1597/dataset_1597.pq
-> HTTP/1.1 200 OK, Content-Length: 73231184, ETag: "1593844f40edbdabaf5bddec4649e1c4"

curl -o ml/data/raw/creditcard_openml_1597.parquet \
  https://data.openml.org/datasets/0000/1597/dataset_1597.pq

certutil -hashfile ml/data/raw/creditcard_openml_1597.parquet MD5
-> 1593844f40edbdabaf5bddec4649e1c4   (matches the ETag exactly)
```

Loaded and checked against OpenML's own published quality metadata:
```
python -c "import pandas as pd; df = pd.read_parquet(...); print(df.shape, df['Class'].value_counts())"
-> shape: (284807, 31); Class 0: 284315, Class 1: 492
```
Matches OpenML's `NumberOfInstances=284807`, `MajorityClassSize=284315`,
`MinorityClassSize=492` exactly. Full provenance record (license, citation,
domain statement) is in `xgb_baseline/dataset.py`'s module docstring and in the
design doc.

## 3. Environment: exact commands

```
python -m venv ml/.venv
ml/.venv/Scripts/python.exe -m pip install --upgrade pip
ml/.venv/Scripts/python.exe -m pip install xgboost pandas pyarrow scikit-learn
```
Result: `xgboost-3.4.1` (prebuilt CPU wheel, `win_amd64`, no compiler needed --
confirmed a real risk given the system's very new Python 3.14.6, and confirmed
it was NOT actually a problem), plus `pandas-3.0.5`, `numpy-2.5.3`,
`pyarrow-25.0.1`, `scikit-learn-1.9.0`, `scipy-1.18.1`, `joblib-1.6.0`. Full
pinned list frozen to `ml/requirements.txt` via `pip freeze`.

CPU-only smoke test before building the real pipeline:
```
ml/.venv/Scripts/python.exe -c "from xgboost import XGBClassifier; ... tree_method='hist' ..."
-> CPU fit smoke test OK
```
No GPU device requested anywhere (`device="cpu"` explicit in `train.py`); no
CUDA build of xgboost was installed or considered, consistent with
`ml/docs/ml/environment.md`'s finding that GPU readiness on this machine is
unverified for any framework.

## 4. Training run: exact command and actual results

```
ml/.venv/Scripts/python.exe ml/scripts/run_xgb_baseline.py
```

Chosen threshold (argmax F1 on **validation** predictions only): **0.95**

**Validation** (57 fraud / 56,904 legitimate):

| Metric | Value |
| --- | --- |
| Precision | 0.9333 |
| Recall | 0.7368 |
| F1 | 0.8235 |
| PR-AUC | 0.7887 |
| ROC-AUC | 0.9748 |
| Confusion matrix | `[[TN=56901, FP=3], [FN=15, TP=42]]` |

**Test** (75 fraud / 56,887 legitimate) -- threshold fixed from validation, not
re-tuned:

| Metric | Value |
| --- | --- |
| Precision | 0.8889 |
| Recall | 0.7467 |
| F1 | 0.8116 |
| PR-AUC | 0.7951 |
| ROC-AUC | 0.9694 |
| Confusion matrix | `[[TN=56880, FP=7], [FN=19, TP=56]]` |

Validation and test metrics are close to each other (F1 0.824 vs 0.812), which
is what you'd want to see -- no sign of the threshold being badly overfit to the
validation split. Both splits had nonzero support for both classes, so every
metric above is actually defined (no "undefined metric" case was hit, though
`evaluate.py` and its tests confirm that case is handled honestly when it does
occur).

**This was trained and evaluated entirely on the OpenML credit-card dataset --
not on the seven-transaction MuleGraph demo fixture, and not on any label
produced by `ml/rules`.** The rules engine's output was not used anywhere in
this pipeline, by design (per the brief's explicit prohibition on using
rule-generated labels as independent evaluation evidence).

## 5. Standalone inference: verified, not just implemented

```python
from xgb_baseline.inference import load_model, predict
loaded = load_model()  # loads ml/models/xgb_baseline.joblib only
preds = predict(loaded, some_rows)
```

Run against all 75 actual fraud rows in the test split: 56 scored above the
0.95 threshold (`is_fraud=True`), 19 below -- exactly matching the test
confusion matrix's TP=56/FN=19. Run against a random sample of 10 legitimate
test rows: all scored well below threshold (scores ~1e-5 to ~1e-7). Confirmed
`ml/xgb_baseline/inference.py` imports only `joblib`, `pandas`, and
`.features` -- no import of `train.py` -- both by grepping the file's actual
import statements and via `test_inference_does_not_import_train_module`.

## 6. Tests: exact commands and results

**Rules engine (system Python, no training frameworks installed) -- re-run after
adding the XGBoost pipeline, to prove it's still unaffected:**
```
python -m unittest discover -s ml/tests -t ml
-> Ran 24 tests in 0.016s, OK
python -c "import xgboost"
-> ModuleNotFoundError: No module named 'xgboost'   (system Python; expected and correct)
```

**XGBoost pipeline (project-local venv):**
```
ml/.venv/Scripts/python.exe -m unittest discover -s ml/xgb_baseline/tests -t ml -v
-> Ran 20 tests in 0.953s, OK
```

Coverage: dataset provenance/integrity checks (correct row/fraud counts;
rejects a wrong-schema file and a truncated file via real temp-file fixtures,
not just inline assertions; missing file raises `FileNotFoundError`);
chronological split correctness (sizes sum to total, strictly non-decreasing
time across splits, every split has both classes); feature extraction
(fixed column order, the `hour_of_window` engineered feature wraps correctly
at 24h, missing-column input raises, and it's provably stateless across
repeated calls); metric computation (perfect-separation sanity check,
single-class-split honesty, threshold sensitivity); threshold selection
(chosen threshold is not dominated by any coarser candidate on the same
validation data); and inference (score/is_fraud shape, is_fraud consistent
with the saved threshold, known fraud rows score higher on average than
legitimate rows, malformed input raises, no import of `train.py`).

## 7. Limitations (see the design doc for full detail -- summarized here)

1. Domain mismatch: real credit-card fraud, not AML/mule-network fraud; no
   account or graph structure exists in this dataset at all.
2. Label methodology undisclosed by the original data providers.
3. No entity/account identifier exists, so entity-level train/test leakage
   (the leakage dimension that would matter most for MuleGraph's actual
   problem) cannot be checked in this dataset -- only temporal leakage was
   addressed.
4. `predict_proba` is a genuine model output but not separately calibrated --
   documented distinctly from `ml/rules`'s explicitly-non-model heuristic
   score, so a future consumer can't conflate the two "not a probability"
   caveats into one meaning.
5. Baseline hyperparameters are reasonable CPU-fast defaults, not tuned.

## 8. Remaining blockers and what's next

- **IBM AML (and Elliptic) remain blocked** on Kaggle authentication this
  environment doesn't have. If Kaggle credentials become available (a
  `kaggle.json` API token), re-running the acquisition step against the real
  target dataset is the natural next action -- the pipeline's `dataset.py` /
  `features.py` split would need real rework for that dataset's actual schema
  (it has sender/receiver/bank/account fields IBM AML's schema, not PCA
  components), not just a path change.
- **GraphSAGE (Stage 3) stays blocked**, per the explicit dual gate: the
  application integration gate (`docs/milestone-1.md`) is still pending --
  `backend/` and `frontend/` are still empty `.gitkeep` placeholders, re-verified
  during this session -- and while this XGBoost baseline is now complete with
  real, consistent validation/test metrics, the brief's gate requires **both**
  conditions, not just this one.
- **No coordination with Smit** on the proposed inference interface (design
  doc, section "Proposed inference interface") has happened -- it's a starting
  point for that conversation, not a frozen contract.
- Nothing in this stage was committed or pushed, per instruction -- all files
  above are new/modified in the working tree only.
