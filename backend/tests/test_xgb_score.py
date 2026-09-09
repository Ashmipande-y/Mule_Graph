import json
from pathlib import Path

import pytest

import app.adapters.xgb_baseline as xgb_adapter

VALID_V = [0.0] * 28

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLES_PATH = REPO_ROOT / "backend" / "examples" / "xgb_score_samples.json"
SAMPLES = json.loads(SAMPLES_PATH.read_text(encoding="utf-8"))

# The trained model file is gitignored (ml/models/*.joblib) -- not present on
# a fresh checkout or a stock CI runner -- and the optional xgboost/pandas/
# joblib stack (backend/requirements-xgb.txt) may not be installed even when
# the file is (e.g. a lightweight venv with only requirements.txt). Only the
# two tests that need a real model load are skipped when either is missing;
# validation/CORS/unavailable-path tests don't touch the model and always
# run. Same convention as backend/tests/test_aml.py's `requires_data`.
MODEL_PATH = REPO_ROOT / "ml" / "models" / "xgb_baseline.joblib"
try:
    import joblib  # noqa: F401
    import xgboost  # noqa: F401

    XGB_STACK_INSTALLED = True
except ImportError:
    XGB_STACK_INSTALLED = False
MODEL_PRESENT = MODEL_PATH.exists() and XGB_STACK_INSTALLED
requires_model = pytest.mark.skipif(
    not MODEL_PRESENT,
    reason=f"{MODEL_PATH} not populated and/or backend/requirements-xgb.txt not installed; run ml/scripts/run_xgb_baseline.py first",
)


@requires_model
def test_xgb_score_returns_model_output(client):
    resp = client.post("/api/xgb-score", json={"time": 5000, "amount": 149.62, "v": VALID_V})
    assert resp.status_code == 200
    body = resp.json()
    assert body["model_mode"] == "xgboost_card_fraud_baseline"
    assert isinstance(body["score"], float)
    assert isinstance(body["is_fraud"], bool)
    assert isinstance(body["threshold"], float)


def test_xgb_score_rejects_wrong_v_length(client):
    resp = client.post("/api/xgb-score", json={"time": 0, "amount": 1, "v": [1, 2, 3]})
    assert resp.status_code == 422


def test_xgb_score_rejects_negative_amount(client):
    resp = client.post("/api/xgb-score", json={"time": 0, "amount": -1, "v": VALID_V})
    assert resp.status_code == 422


def test_xgb_score_missing_fields(client):
    resp = client.post("/api/xgb-score", json={"time": 0})
    assert resp.status_code == 422


def test_xgb_score_returns_503_when_model_unavailable(client, monkeypatch):
    def _raise_unavailable(*args, **kwargs):
        raise xgb_adapter.XgbUnavailableError("model file not found")

    monkeypatch.setattr("app.api.xgb_score.score_row", _raise_unavailable)
    resp = client.post("/api/xgb-score", json={"time": 0, "amount": 1, "v": VALID_V})
    assert resp.status_code == 503
    assert "detail" in resp.json()


def test_cors_preflight_allows_post_for_xgb_score(client):
    # A real browser preflights any POST carrying a JSON body before sending
    # it. curl (used elsewhere to "verify" this endpoint) never preflights,
    # so a CORSMiddleware misconfiguration here is invisible to curl-only
    # checks but breaks the endpoint for every actual browser caller -- see
    # backend/docs/integration-contract.md.
    resp = client.options(
        "/api/xgb-score",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.status_code == 200
    assert "POST" in resp.headers.get("access-control-allow-methods", "")
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_graph_and_health_unaffected_by_xgb_route(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/graph").status_code == 200


@requires_model
@pytest.mark.parametrize("sample", SAMPLES, ids=[s["description"] for s in SAMPLES])
def test_xgb_score_matches_recorded_fixture_output(client, sample):
    # Real held-out-test-split rows (backend/examples/README.md) -- the live
    # endpoint must reproduce exactly what the trained model already
    # produced for these rows, since it's the same model and the same input.
    resp = client.post(
        "/api/xgb-score",
        json={"time": sample["time"], "amount": sample["amount"], "v": sample["v"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == pytest.approx(sample["model_score"], abs=1e-4)
    assert body["is_fraud"] == sample["model_is_fraud"]
