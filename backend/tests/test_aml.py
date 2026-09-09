import pytest

from app.adapters import aml_baseline
from app.services import aml_dataset, aml_session

DATA_PRESENT = aml_dataset.get_settings().aml_transfers_path.exists()
requires_data = pytest.mark.skipif(not DATA_PRESENT, reason="data/aml/transfers_inr.csv not populated")


@pytest.fixture(autouse=True)
def reset_session():
    aml_session.reset()
    yield
    aml_session.reset()


def valid_transaction(**overrides):
    base = {
        "id": "NEW_TX_TEST",
        "sender": "TEST_SENDER",
        "receiver": "TEST_RECEIVER",
        "amount_paise": 100000,
        "currency": "INR",
        "timestamp": "2022-09-01T00:05:00Z",
        "payment_format": "ACH",
    }
    base.update(overrides)
    return base


# --- existing endpoints unaffected -----------------------------------------


def test_health_unaffected(client):
    assert client.get("/health").status_code == 200


def test_canonical_graph_unaffected(client):
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["nodes"]) == 6
    assert len(body["edges"]) == 7


@requires_data
def test_xgb_score_unaffected_by_aml_router(client):
    resp = client.post("/api/xgb-score", json={"time": 0, "amount": 1, "v": [0.0] * 28})
    assert resp.status_code == 200


# --- summary -----------------------------------------------------------------


@requires_data
def test_summary_reports_real_dataset_counts(client):
    resp = client.get("/api/aml/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["label"] == "IBM synthetic AML benchmark"
    assert body["total_transactions"] == 27511
    assert body["total_accounts"] == 9958
    assert body["currency"] == "INR"
    assert body["session_transaction_count"] == 0


@requires_data
def test_summary_reflects_committed_session_transactions(client):
    client.post("/api/aml/session/transactions", json={"transactions": [valid_transaction()]})
    resp = client.get("/api/aml/summary")
    body = resp.json()
    assert body["session_transaction_count"] == 1
    assert body["total_transactions"] == 27512


# --- transactions: pagination and filtering ----------------------------------


@requires_data
def test_transactions_are_paginated_not_returned_whole(client):
    resp = client.get("/api/aml/transactions", params={"limit": 10})
    body = resp.json()
    assert len(body["items"]) == 10
    assert body["total_matching"] == 27511
    assert body["next_cursor"] == 10


@requires_data
def test_transactions_limit_is_clamped(client):
    resp = client.get("/api/aml/transactions", params={"limit": 10000})
    assert resp.status_code == 422  # ge/le constraint on the query param


@requires_data
def test_transactions_filtered_by_account(client):
    first_page = client.get("/api/aml/transactions", params={"limit": 1}).json()
    account = first_page["items"][0]["sender"]
    resp = client.get("/api/aml/transactions", params={"account": account, "limit": 500})
    body = resp.json()
    assert body["total_matching"] >= 1
    for item in body["items"]:
        assert account in (item["sender"], item["receiver"])


@requires_data
def test_transactions_filtered_by_time_range(client):
    resp = client.get(
        "/api/aml/transactions",
        params={"after": "2022-09-01T00:00:00Z", "before": "2022-09-01T00:00:00Z", "limit": 500},
    )
    body = resp.json()
    assert body["total_matching"] > 0
    for item in body["items"]:
        assert item["timestamp"] == "2022-09-01T00:00:00Z"


# --- graph: bounded neighborhoods --------------------------------------------


@requires_data
def test_graph_default_neighborhood_is_bounded(client):
    resp = client.get("/api/aml/graph")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["nodes"]) <= 40
    assert len(body["edges"]) <= 120
    assert body["dataset_label"] == "IBM synthetic AML benchmark"


@requires_data
def test_graph_respects_max_nodes_and_edges(client):
    resp = client.get("/api/aml/graph", params={"max_nodes": 5, "max_edges": 5})
    body = resp.json()
    assert len(body["nodes"]) <= 5
    assert len(body["edges"]) <= 5


@requires_data
def test_graph_seeded_by_account(client):
    first_page = client.get("/api/aml/transactions", params={"limit": 1}).json()
    account = first_page["items"][0]["sender"]
    resp = client.get("/api/aml/graph", params={"account": account})
    body = resp.json()
    assert body["seed_account"] == account
    assert account in [n["id"] for n in body["nodes"]]


@requires_data
def test_graph_findings_are_labeled_as_rules_output(client):
    resp = client.get("/api/aml/graph")
    body = resp.json()
    assert "rules_findings" in body
    for finding in body["rules_findings"]:
        assert "score_method" in finding  # rules Finding.score_method, never an XGBoost artifact


# --- assess: validation errors -----------------------------------------------


@requires_data
def test_assess_rejects_invalid_amount(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(amount_paise=0)]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_negative_amount(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(amount_paise=-5)]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_unsupported_currency(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(currency="USD")]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_unsupported_payment_format(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(payment_format="Cheque")]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_malformed_timestamp_with_seconds(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(timestamp="2022-09-01T00:00:05Z")]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_self_transfer(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(sender="X", receiver="X")]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_duplicate_id_within_request(client):
    tx = valid_transaction()
    resp = client.post("/api/aml/assess", json={"transactions": [tx, dict(tx, receiver="OTHER")]})
    assert resp.status_code == 409


@requires_data
def test_assess_rejects_empty_transaction_list(client):
    resp = client.post("/api/aml/assess", json={"transactions": []})
    assert resp.status_code == 422


# --- assess: single and batch, real scoring ----------------------------------


@requires_data
def test_assess_single_transaction_returns_real_score(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction()]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["model_version"] == "aml_baseline_v1"
    assert len(body["results"]) == 1
    result = body["results"][0]
    assert 0.0 <= result["score"] <= 1.0
    assert result["is_laundering"] == (result["score"] >= result["threshold"])
    assert len(result["features"]) == 35


@requires_data
def test_assess_never_commits_to_session(client):
    client.post("/api/aml/assess", json={"transactions": [valid_transaction()]})
    summary = client.get("/api/aml/summary").json()
    assert summary["session_transaction_count"] == 0


@requires_data
def test_assess_batch_result_order_matches_request_order(client):
    later = valid_transaction(id="LATER", timestamp="2022-09-01T01:00:00Z")
    earlier = valid_transaction(id="EARLIER", timestamp="2022-09-01T00:00:00Z")
    resp = client.post("/api/aml/assess", json={"transactions": [later, earlier]})
    body = resp.json()
    assert [r["transaction_id"] for r in body["results"]] == ["LATER", "EARLIER"]


@requires_data
def test_assess_batch_sibling_sees_earlier_sibling_as_history(client):
    first = valid_transaction(id="B1", sender="FRESH_BATCH_X", receiver="FRESH_BATCH_Y", timestamp="2022-09-01T00:00:00Z")
    second = valid_transaction(id="B2", sender="FRESH_BATCH_X", receiver="FRESH_BATCH_Z", timestamp="2022-09-01T00:10:00Z")
    resp = client.post("/api/aml/assess", json={"transactions": [first, second]})
    results = {r["transaction_id"]: r for r in resp.json()["results"]}
    assert results["B1"]["features"]["sender_has_prior_activity"] == 0
    assert results["B2"]["features"]["sender_has_prior_activity"] == 1


@requires_data
def test_assess_sees_previously_committed_session_history(client):
    committed = valid_transaction(id="COMMITTED_1", sender="FRESH_SESSION_A", receiver="FRESH_SESSION_B", timestamp="2022-09-01T00:00:00Z")
    client.post("/api/aml/session/transactions", json={"transactions": [committed]})

    proposed = valid_transaction(id="PROPOSED_1", sender="FRESH_SESSION_A", receiver="FRESH_SESSION_C", timestamp="2022-09-01T00:30:00Z")
    resp = client.post("/api/aml/assess", json={"transactions": [proposed]})
    result = resp.json()["results"][0]
    assert result["features"]["sender_has_prior_activity"] == 1


# --- session commit -----------------------------------------------------------


@requires_data
def test_session_commit_success(client):
    resp = client.post("/api/aml/session/transactions", json={"transactions": [valid_transaction()]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_transaction_count"] == 1
    assert body["committed"][0]["id"] == "NEW_TX_TEST"


@requires_data
def test_session_commit_rejects_id_already_in_base_dataset(client):
    existing_id = client.get("/api/aml/transactions", params={"limit": 1}).json()["items"][0]["id"]
    resp = client.post(
        "/api/aml/session/transactions",
        json={"transactions": [valid_transaction(id=existing_id)]},
    )
    assert resp.status_code == 409


@requires_data
def test_session_commit_rejects_id_already_committed(client):
    tx = valid_transaction()
    client.post("/api/aml/session/transactions", json={"transactions": [tx]})
    resp = client.post("/api/aml/session/transactions", json={"transactions": [tx]})
    assert resp.status_code == 409


@requires_data
def test_committed_transaction_appears_in_transaction_list(client):
    client.post("/api/aml/session/transactions", json={"transactions": [valid_transaction()]})
    resp = client.get("/api/aml/transactions", params={"account": "TEST_SENDER"})
    ids = [item["id"] for item in resp.json()["items"]]
    assert "NEW_TX_TEST" in ids


# --- model unavailable --------------------------------------------------------


def test_assess_returns_503_when_model_unavailable(client, monkeypatch):
    def _raise_unavailable(*args, **kwargs):
        raise aml_baseline.AmlModelUnavailableError("model file not found")

    monkeypatch.setattr("app.api.aml.aml_baseline.score_transactions", _raise_unavailable)
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction()]})
    assert resp.status_code == 503
    assert "detail" in resp.json()


@requires_data
def test_summary_reports_model_unavailable_gracefully(client, monkeypatch):
    def _raise_unavailable():
        raise aml_baseline.AmlModelUnavailableError("model file not found")

    monkeypatch.setattr("app.api.aml.aml_baseline.model_metadata", _raise_unavailable)
    resp = client.get("/api/aml/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["model_available"] is False
    assert body["model_version"] is None


def test_dataset_endpoints_return_500_when_dataset_missing(client, monkeypatch):
    def _raise_dataset_error(*args, **kwargs):
        raise aml_dataset.AmlDatasetError("dataset file not found")

    monkeypatch.setattr("app.api.aml.aml_dataset.get_summary", _raise_dataset_error)
    resp = client.get("/api/aml/summary")
    assert resp.status_code == 500
    assert "detail" in resp.json()
