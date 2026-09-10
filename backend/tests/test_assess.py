import pytest

CANONICAL_TRANSACTIONS = [
    {"id": "TX_001", "sender": "ACC_VICTIM", "receiver": "ACC_A", "amount": 50000, "timestamp": "2026-01-01T10:00:00Z"},
    {"id": "TX_002", "sender": "ACC_A", "receiver": "ACC_B", "amount": 15000, "timestamp": "2026-01-01T10:00:04Z"},
    {"id": "TX_003", "sender": "ACC_A", "receiver": "ACC_C", "amount": 14000, "timestamp": "2026-01-01T10:00:07Z"},
    {"id": "TX_004", "sender": "ACC_A", "receiver": "ACC_D", "amount": 16000, "timestamp": "2026-01-01T10:00:10Z"},
    {"id": "TX_005", "sender": "ACC_B", "receiver": "ACC_X", "amount": 13000, "timestamp": "2026-01-01T10:00:15Z"},
    {"id": "TX_006", "sender": "ACC_C", "receiver": "ACC_X", "amount": 12000, "timestamp": "2026-01-01T10:00:18Z"},
    {"id": "TX_007", "sender": "ACC_D", "receiver": "ACC_X", "amount": 14000, "timestamp": "2026-01-01T10:00:21Z"},
]


def valid_transaction(**overrides):
    base = {
        "id": "NEW_TX",
        "sender": "ACC_P",
        "receiver": "ACC_Q",
        "amount": 1000,
        "timestamp": "2026-01-01T00:00:00Z",
    }
    base.update(overrides)
    return base


# --- existing endpoints unaffected -------------------------------------------


def test_health_unaffected(client):
    assert client.get("/health").status_code == 200


def test_canonical_graph_unaffected(client):
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["nodes"]) == 6
    assert len(body["edges"]) == 7


def test_assess_never_mutates_the_canonical_graph(client):
    before = client.get("/api/graph").json()
    client.post("/api/assess", json={"transactions": [valid_transaction()]})
    after = client.get("/api/graph").json()
    assert before == after


# --- validation errors -------------------------------------------------------


def test_assess_rejects_empty_transaction_list(client):
    resp = client.post("/api/assess", json={"transactions": []})
    assert resp.status_code == 422


def test_assess_rejects_missing_field(client):
    tx = valid_transaction()
    del tx["sender"]
    resp = client.post("/api/assess", json={"transactions": [tx]})
    assert resp.status_code == 422


def test_assess_rejects_zero_amount(client):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(amount=0)]})
    assert resp.status_code == 422


def test_assess_rejects_negative_amount(client):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(amount=-5)]})
    assert resp.status_code == 422


def test_assess_rejects_boolean_amount(client):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(amount=True)]})
    assert resp.status_code == 422


def test_assess_rejects_fractional_amount(client):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(amount=1000.5)]})
    assert resp.status_code == 422


def test_assess_rejects_whole_number_float_amount(client):
    # Silently truncating a float into the integer amount field is exactly
    # the "unintended coercion" bug fixed for the AML schema -- must not be
    # reintroduced here for the canonical demo schema either.
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(amount=1000.0)]})
    assert resp.status_code == 422


def test_assess_rejects_amount_as_numeric_string(client):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(amount="1000")]})
    assert resp.status_code == 422


def test_assess_rejects_empty_id(client):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(id="")]})
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "bad_timestamp",
    [
        "2026-02-30T00:00:00Z",  # Feb 30 never exists
        "2026-13-01T00:00:00Z",  # month 13
        "2026-01-01T25:00:00Z",  # hour 25
        "2026-01-01T00:00:00",  # missing trailing Z
        "not-a-timestamp",
    ],
)
def test_assess_rejects_invalid_timestamp(client, bad_timestamp):
    resp = client.post("/api/assess", json={"transactions": [valid_transaction(timestamp=bad_timestamp)]})
    assert resp.status_code == 422


def test_assess_rejects_duplicate_id_within_request(client):
    tx = valid_transaction()
    resp = client.post("/api/assess", json={"transactions": [tx, dict(tx, receiver="OTHER")]})
    assert resp.status_code == 409


# --- real rules-derived evidence, parity with GET /api/graph -----------------


def test_assess_canonical_network_matches_graph_endpoint(client):
    graph = client.get("/api/graph").json()
    graph_scores = {n["id"]: (n["risk_score"], n["risk_level"]) for n in graph["nodes"]}

    resp = client.post("/api/assess", json={"transactions": CANONICAL_TRANSACTIONS})
    assert resp.status_code == 200
    body = resp.json()

    assess_scores = {a["account_id"]: (a["risk_score"], a["risk_level"]) for a in body["accounts"]}
    assert assess_scores == graph_scores


def test_assess_reports_real_findings_and_evidence(client):
    resp = client.post("/api/assess", json={"transactions": CANONICAL_TRANSACTIONS})
    body = resp.json()

    assert body["status"] == "completed"
    assert body["model_mode"] == "rules"
    assert len(body["patterns"]) == 1
    pattern = body["patterns"][0]
    assert pattern["pattern"] == "fan_out_convergence"
    assert pattern["source_account"] == "ACC_A"
    assert pattern["collector_account"] == "ACC_X"
    assert set(pattern["intermediary_accounts"]) == {"ACC_B", "ACC_C", "ACC_D"}
    assert 0.0 < pattern["score"] <= 1.0
    assert "heuristic" in pattern["score_method"]
    assert isinstance(pattern["evidence"], dict) and pattern["evidence"]

    acc_a = next(a for a in body["accounts"] if a["account_id"] == "ACC_A")
    assert acc_a["roles"] == ["source"]
    assert acc_a["finding_count"] == 1
    assert set(acc_a["evidence_transaction_ids"]) == {"TX_002", "TX_003", "TX_004"}
    assert acc_a["account_id"] in body["accounts_requiring_review"]


def test_assess_leaves_unrelated_account_unassessed(client):
    resp = client.post("/api/assess", json={"transactions": CANONICAL_TRANSACTIONS})
    body = resp.json()
    victim = next(a for a in body["accounts"] if a["account_id"] == "ACC_VICTIM")
    assert victim["risk_score"] is None
    assert victim["risk_level"] == "UNASSESSED"
    assert victim["account_id"] not in body["accounts_requiring_review"]


def test_assess_with_no_qualifying_pattern_returns_all_unassessed(client):
    # Only two intermediaries -- below min_intermediaries=3, so no finding.
    transactions = [
        valid_transaction(id="A1", sender="SRC", receiver="I1", timestamp="2026-01-01T00:00:00Z"),
        valid_transaction(id="A2", sender="SRC", receiver="I2", timestamp="2026-01-01T00:00:05Z"),
        valid_transaction(id="A3", sender="I1", receiver="COLLECTOR", timestamp="2026-01-01T00:00:10Z"),
        valid_transaction(id="A4", sender="I2", receiver="COLLECTOR", timestamp="2026-01-01T00:00:15Z"),
    ]
    resp = client.post("/api/assess", json={"transactions": transactions})
    body = resp.json()
    assert body["patterns"] == []
    assert body["accounts_requiring_review"] == []
    assert all(a["risk_level"] == "UNASSESSED" and a["risk_score"] is None for a in body["accounts"])


def test_assess_detects_fan_out_with_rapid_forwarding(client):
    transactions = [
        {"id": "TX_1", "sender": "ACCOUNT_A", "receiver": "ACCOUNT_B", "amount": 10000, "timestamp": "2026-09-10T10:00:00Z"},
        {"id": "TX_2", "sender": "ACCOUNT_A", "receiver": "ACCOUNT_C", "amount": 9950, "timestamp": "2026-09-10T10:02:00Z"},
        {"id": "TX_3", "sender": "ACCOUNT_A", "receiver": "ACCOUNT_D", "amount": 9800, "timestamp": "2026-09-10T10:04:00Z"},
        {"id": "TX_4", "sender": "ACCOUNT_D", "receiver": "ACCOUNT_E", "amount": 9700, "timestamp": "2026-09-10T10:06:00Z"},
    ]
    response = client.post("/api/assess", json={"transactions": transactions})
    assert response.status_code == 200
    body = response.json()
    finding = next(p for p in body["patterns"] if p["pattern"] == "fan_out_rapid_forwarding")
    assert finding["score"] >= 0.75
    assert finding["source_account"] == "ACCOUNT_A"
    assert finding["collector_account"] == "ACCOUNT_E"
    assert finding["evidence"]["pass_through_ratio"] == 0.9898
    assert {"ACCOUNT_A", "ACCOUNT_D", "ACCOUNT_E"}.issubset(body["accounts_requiring_review"])


def test_assess_response_has_a_real_utc_assessed_at(client):
    import datetime

    resp = client.post("/api/assess", json={"transactions": [valid_transaction()]})
    body = resp.json()
    # Must be a real, parseable UTC timestamp close to "now" -- not a
    # placeholder or client-echoed value.
    parsed = datetime.datetime.strptime(body["assessed_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    now = datetime.datetime.now(datetime.timezone.utc)
    assert abs((now - parsed).total_seconds()) < 60


# --- CORS preflight (mirrors the xgb-score regression test) ------------------


def test_cors_preflight_allows_post_for_assess(client):
    resp = client.options(
        "/api/assess",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.status_code == 200
    assert "POST" in resp.headers.get("access-control-allow-methods", "")
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
