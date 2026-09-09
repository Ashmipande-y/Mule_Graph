import pytest

from app import config
from app.adapters import aml_baseline
from app.services import aml_dataset, aml_session

try:
    import pandas  # noqa: F401

    PANDAS_INSTALLED = True
except ImportError:
    PANDAS_INSTALLED = False

# The dataset CSV can exist without the optional stack (backend/requirements-xgb.txt,
# pandas in particular) being installed in the current environment (e.g. a
# lightweight venv with only requirements.txt) -- check both, or these tests
# fail with a real 500 instead of skipping cleanly.
DATA_PRESENT = PANDAS_INSTALLED and aml_dataset.get_settings().aml_transfers_path.exists()
requires_data = pytest.mark.skipif(
    not DATA_PRESENT, reason="data/aml/transfers_inr.csv not populated and/or pandas (backend/requirements-xgb.txt) not installed"
)


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


def test_xgb_score_unaffected_by_aml_router(client):
    # Proves the route still exists and responds per its own contract once
    # the AML router is also registered -- not a real-model-output check
    # (that's backend/tests/test_xgb_score.py's job, self-skipped there when
    # the model artifact isn't present). 503 (model genuinely unavailable on
    # this machine) is as valid a "the route works" signal as 200 here.
    resp = client.post("/api/xgb-score", json={"time": 0, "amount": 1, "v": [0.0] * 28})
    assert resp.status_code in (200, 503)


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


# --- ground-truth labeled networks -------------------------------------------


@requires_data
def test_labeled_networks_returns_real_discovered_networks(client):
    resp = client.get("/api/aml/labeled-networks")
    assert resp.status_code == 200
    body = resp.json()
    assert "ground-truth" in body["source_note"] or "answer key" in body["source_note"]
    assert len(body["networks"]) == 8  # default max_results, and the real dataset has enough distinct clusters

    top = body["networks"][0]
    assert top["seed_account"] == "IBM_HIS_V8:B0112931:A805D4C850"
    assert top["labeled_laundering_transaction_count"] == 15
    second = body["networks"][1]
    assert second["seed_account"] == "IBM_HIS_V8:B0013078:A8053B01E0"
    assert second["labeled_laundering_transaction_count"] == 13
    # Descending order by real labeled-transaction count.
    counts = [n["labeled_laundering_transaction_count"] for n in body["networks"]]
    assert counts == sorted(counts, reverse=True)
    for network in body["networks"]:
        assert network["ml_rules_risk_level"] in ("HIGH", "MEDIUM", "LOW", "UNASSESSED")


@requires_data
def test_labeled_networks_respects_max_results(client):
    resp = client.get("/api/aml/labeled-networks", params={"max_results": 2})
    assert resp.status_code == 200
    assert len(resp.json()["networks"]) == 2


@requires_data
def test_labeled_networks_consistent_with_graph_endpoint(client):
    top = client.get("/api/aml/labeled-networks", params={"max_results": 1}).json()["networks"][0]
    graph = client.get("/api/aml/graph", params={"account": top["seed_account"]}).json()
    assert len(graph["nodes"]) == top["account_count"]
    assert len(graph["edges"]) == top["edge_count"]


@requires_data
def test_is_labeled_laundering_flag_is_accurate(client):
    # A known ground-truth-labeled transaction id (touches the top labeled
    # network's seed account) must read true; an arbitrary early transaction
    # from the dataset (not in the 145-row labels file) must read false.
    graph = client.get(
        "/api/aml/graph", params={"account": "IBM_HIS_V8:B0112931:A805D4C850"}
    ).json()
    flagged = [e for e in graph["edges"] if e["is_labeled_laundering"]]
    assert len(flagged) > 0

    ordinary = client.get("/api/aml/transactions", params={"limit": 1}).json()["items"][0]
    assert ordinary["is_labeled_laundering"] is False


@requires_data
def test_freshly_committed_transaction_is_never_labeled_laundering(client):
    resp = client.post("/api/aml/session/transactions", json={"transactions": [valid_transaction()]})
    assert resp.status_code == 200
    assert resp.json()["committed"][0]["is_labeled_laundering"] is False


def test_labeled_networks_empty_when_labels_file_missing(client, monkeypatch, tmp_path):
    # Missing labels file is optional/non-fatal (mirrors AML_MODE=optional
    # for the base dataset), not an AmlDatasetError -- must return 200 with
    # an empty list, never 500 or a silently-fabricated network. Doesn't
    # need @requires_data: the route returns before ever touching the
    # (possibly pandas-gated) base dataset once labels are empty.
    missing = tmp_path / "does-not-exist.csv"
    monkeypatch.setattr(
        "app.services.aml_dataset.get_settings",
        lambda: config.Settings(aml_labels_path=missing),
    )

    resp = client.get("/api/aml/labeled-networks")
    assert resp.status_code == 200
    assert resp.json()["networks"] == []


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
@pytest.mark.parametrize(
    "bad_timestamp",
    [
        "2022-13-01T00:00:00Z",  # month 13
        "2022-02-30T00:00:00Z",  # Feb 30 never exists
        "2023-02-29T00:00:00Z",  # Feb 29 in a non-leap year
        "2022-01-32T00:00:00Z",  # day 32
        "2022-01-01T24:00:00Z",  # hour 24
        "2022-01-01T00:60:00Z",  # minute 60
        "2022-00-01T00:00:00Z",  # month 0
        "2022-01-00T00:00:00Z",  # day 0
    ],
)
def test_assess_rejects_invalid_calendar_timestamp(client, bad_timestamp):
    # Every one of these has the right digit *shape* for the old
    # regex-only check (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z) but is not a real
    # calendar date/time -- must be rejected with a field-specific 422, not
    # silently accepted into scoring or (worse) stored history.
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(timestamp=bad_timestamp)]})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert any("timestamp" in str(err.get("loc", err)) for err in (detail if isinstance(detail, list) else [detail]))


@requires_data
def test_assess_accepts_a_valid_leap_day_timestamp(client):
    # 2024 is a leap year -- Feb 29 is a real date and must not be rejected
    # by the stricter calendar check that now also rejects Feb 30/29-in-a-
    # non-leap-year above.
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(timestamp="2024-02-29T12:00:00Z")]})
    assert resp.status_code == 200


@requires_data
def test_session_commit_rejects_invalid_calendar_timestamp_and_does_not_store_it(client):
    bad = valid_transaction(timestamp="2022-02-30T00:00:00Z")
    resp = client.post("/api/aml/session/transactions", json={"transactions": [bad]})
    assert resp.status_code == 422

    # The invalid record must never reach session history: the summary count
    # stays at zero, it never appears in the transaction list, and a later
    # graph request (which parses every stored timestamp with
    # datetime.strptime -- see app/adapters/aml_rules.py) does not crash.
    summary = client.get("/api/aml/summary").json()
    assert summary["session_transaction_count"] == 0

    listing = client.get("/api/aml/transactions", params={"account": "TEST_SENDER"}).json()
    assert bad["id"] not in [item["id"] for item in listing["items"]]

    graph_resp = client.get("/api/aml/graph")
    assert graph_resp.status_code == 200


@requires_data
def test_assess_rejects_boolean_amount(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(amount_paise=True)]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_fractional_amount(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(amount_paise=100000.5)]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_whole_number_float_amount(client):
    # 100000.0 has no fractional part, but silently truncating a float into
    # the integer minor-units field is exactly the "unintended coercion"
    # this endpoint must not perform -- only a genuine JSON integer is valid.
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(amount_paise=100000.0)]})
    assert resp.status_code == 422


@requires_data
def test_assess_rejects_amount_as_numeric_string(client):
    resp = client.post("/api/aml/assess", json={"transactions": [valid_transaction(amount_paise="100000")]})
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
    # Deliberately artifact-independent (no @requires_data): mocks the
    # dataset-history lookup too, so this exercises only the
    # model-unavailable path -- not the real dataset/pandas stack, which
    # would otherwise make this test's outcome depend on backend/requirements-xgb.txt
    # being installed for a scenario that isn't actually about the dataset.
    monkeypatch.setattr("app.api.aml.aml_dataset.all_records_sorted", lambda: [])

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
