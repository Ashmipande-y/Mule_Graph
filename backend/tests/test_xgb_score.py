import json
from pathlib import Path

import pytest

import app.adapters.xgb_baseline as xgb_adapter

VALID_V = [0.0] * 28

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLES_PATH = REPO_ROOT / "backend" / "examples" / "xgb_score_samples.json"
SAMPLES = json.loads(SAMPLES_PATH.read_text(encoding="utf-8"))


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


def test_graph_and_health_unaffected_by_xgb_route(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/graph").status_code == 200


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
