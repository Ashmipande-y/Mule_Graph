import json
from pathlib import Path

import pytest

import app.api.graph as graph_api
from app.config import Settings

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CANONICAL_GRAPH_PATH = REPO_ROOT / "data" / "graph.example.json"


def _use_transactions(monkeypatch, tmp_path, transactions):
    tx_path = tmp_path / "transactions.json"
    tx_path.write_text(json.dumps(transactions), encoding="utf-8")
    monkeypatch.setattr(graph_api, "get_settings", lambda: Settings(demo_transactions_path=tx_path))
    return tx_path


# Expected fan-out/convergence result for the canonical demo fixture, per
# backend/docs/integration-contract.md. data/graph.example.json still shows
# null/UNASSESSED for every node (it is the Stage 0/1 frontend reference
# fixture, not re-derived here), so the live API is compared against it
# structurally (ids, labels, edges) and against this table for risk fields.
_CANONICAL_EXPECTED_RISK = {
    "ACC_A": (0.9317, "HIGH"),
    "ACC_B": (0.9317, "HIGH"),
    "ACC_C": (0.9317, "HIGH"),
    "ACC_D": (0.9317, "HIGH"),
    "ACC_X": (0.9317, "HIGH"),
    "ACC_VICTIM": (None, "UNASSESSED"),
}


def _assert_matches_canonical_topology_and_risk(body: dict) -> None:
    expected = json.loads(CANONICAL_GRAPH_PATH.read_text(encoding="utf-8"))
    assert body["edges"] == expected["edges"]
    assert [node["id"] for node in body["nodes"]] == [node["id"] for node in expected["nodes"]]
    assert [node["label"] for node in body["nodes"]] == [node["label"] for node in expected["nodes"]]

    for node in body["nodes"]:
        expected_score, expected_level = _CANONICAL_EXPECTED_RISK[node["id"]]
        assert node["risk_level"] == expected_level, node
        if expected_score is None:
            assert node["risk_score"] is None, node
        else:
            assert node["risk_score"] == pytest.approx(expected_score), node


def test_graph_matches_canonical_reference(client):
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    _assert_matches_canonical_topology_and_risk(resp.json())


def test_graph_empty_transactions(client, monkeypatch, tmp_path):
    _use_transactions(monkeypatch, tmp_path, [])
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    assert resp.json() == {"nodes": [], "edges": [], "findings": []}


def test_graph_repeated_account_pairs_not_collapsed(client, monkeypatch, tmp_path):
    transactions = [
        {"id": "TX_A", "sender": "ACC_1", "receiver": "ACC_2", "amount": 100, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_B", "sender": "ACC_1", "receiver": "ACC_2", "amount": 200, "timestamp": "2026-01-01T00:00:01Z"},
    ]
    _use_transactions(monkeypatch, tmp_path, transactions)
    resp = client.get("/api/graph")
    body = resp.json()
    assert resp.status_code == 200
    assert len(body["edges"]) == 2
    assert {edge["id"] for edge in body["edges"]} == {"TX_A", "TX_B"}


def test_graph_arbitrary_account_ids_use_id_as_label(client, monkeypatch, tmp_path):
    transactions = [
        {
            "id": "TX_1",
            "sender": "ACC_UNKNOWN_1",
            "receiver": "ACC_UNKNOWN_2",
            "amount": 500,
            "timestamp": "2026-01-01T00:00:00Z",
        },
    ]
    _use_transactions(monkeypatch, tmp_path, transactions)
    body = client.get("/api/graph").json()
    nodes_by_id = {node["id"]: node for node in body["nodes"]}
    assert nodes_by_id["ACC_UNKNOWN_1"]["label"] == "ACC_UNKNOWN_1"
    assert nodes_by_id["ACC_UNKNOWN_2"]["label"] == "ACC_UNKNOWN_2"


def test_graph_nodes_and_edges_sorted(client, monkeypatch, tmp_path):
    transactions = [
        {"id": "TX_2", "sender": "ACC_Z", "receiver": "ACC_A", "amount": 100, "timestamp": "2026-01-01T00:00:05Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_Z", "amount": 50, "timestamp": "2026-01-01T00:00:01Z"},
    ]
    _use_transactions(monkeypatch, tmp_path, transactions)
    body = client.get("/api/graph").json()
    assert [node["id"] for node in body["nodes"]] == ["ACC_A", "ACC_Z"]
    assert [edge["id"] for edge in body["edges"]] == ["TX_1", "TX_2"]


@pytest.mark.parametrize(
    "bad_record",
    [
        {"sender": "ACC_A", "receiver": "ACC_B", "amount": 10, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": True, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 0, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": -5, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 10.5, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": "10", "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 10, "timestamp": "not-a-timestamp"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 10, "timestamp": "2026-02-30T00:00:00Z"},
        {"id": "", "sender": "ACC_A", "receiver": "ACC_B", "amount": 10, "timestamp": "2026-01-01T00:00:00Z"},
    ],
)
def test_graph_rejects_invalid_records(client, monkeypatch, tmp_path, bad_record):
    _use_transactions(monkeypatch, tmp_path, [bad_record])
    resp = client.get("/api/graph")
    assert resp.status_code == 500
    assert "detail" in resp.json()


def test_graph_rejects_duplicate_transaction_ids(client, monkeypatch, tmp_path):
    transactions = [
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 10, "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_C", "amount": 20, "timestamp": "2026-01-01T00:00:01Z"},
    ]
    _use_transactions(monkeypatch, tmp_path, transactions)
    resp = client.get("/api/graph")
    assert resp.status_code == 500


def test_graph_missing_file_returns_500_without_stack_trace(client, monkeypatch, tmp_path):
    missing_path = tmp_path / "does_not_exist.json"
    monkeypatch.setattr(graph_api, "get_settings", lambda: Settings(demo_transactions_path=missing_path))
    resp = client.get("/api/graph")
    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "Traceback" not in json.dumps(body)


def test_graph_malformed_json_returns_500(client, monkeypatch, tmp_path):
    tx_path = tmp_path / "transactions.json"
    tx_path.write_text("{not valid json", encoding="utf-8")
    monkeypatch.setattr(graph_api, "get_settings", lambda: Settings(demo_transactions_path=tx_path))
    resp = client.get("/api/graph")
    assert resp.status_code == 500


def test_graph_works_independent_of_working_directory(client, monkeypatch, tmp_path_factory):
    other_cwd = tmp_path_factory.mktemp("elsewhere")
    monkeypatch.chdir(other_cwd)
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    _assert_matches_canonical_topology_and_risk(resp.json())


def test_graph_risk_fields_null_unassessed_when_no_pattern_matches(client, monkeypatch, tmp_path):
    # Two accounts, one transfer: no fan-out/convergence pattern possible.
    transactions = [
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 100, "timestamp": "2026-01-01T00:00:00Z"},
    ]
    _use_transactions(monkeypatch, tmp_path, transactions)
    body = client.get("/api/graph").json()
    for node in body["nodes"]:
        assert node["risk_score"] is None
        assert node["risk_level"] == "UNASSESSED"


def test_graph_reports_real_findings_for_canonical_fixture(client):
    # findings must be genuine ml/rules evidence, not reconstructed from
    # node risk_score/risk_level -- verified here against the same known
    # canonical result backend/docs/integration-contract.md documents.
    body = client.get("/api/graph").json()
    assert len(body["findings"]) == 1
    finding = body["findings"][0]
    assert finding["pattern"] == "fan_out_convergence"
    assert finding["source_account"] == "ACC_A"
    assert finding["collector_account"] == "ACC_X"
    assert set(finding["intermediary_accounts"]) == {"ACC_B", "ACC_C", "ACC_D"}
    assert finding["score"] == pytest.approx(0.9317)
    assert len(finding["fan_out_transaction_ids"]) == 3
    assert len(finding["convergence_transaction_ids"]) == 3
    assert isinstance(finding["evidence"], dict) and finding["evidence"]


def test_graph_findings_empty_when_no_pattern_matches(client, monkeypatch, tmp_path):
    transactions = [
        {"id": "TX_1", "sender": "ACC_A", "receiver": "ACC_B", "amount": 100, "timestamp": "2026-01-01T00:00:00Z"},
    ]
    _use_transactions(monkeypatch, tmp_path, transactions)
    body = client.get("/api/graph").json()
    assert body["findings"] == []


def test_cors_allows_configured_frontend_origin(client):
    resp = client.get("/api/graph", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_allows_127_0_0_1_loopback_variant(client):
    # A browser treats "localhost" and "127.0.0.1" as different origins even
    # though both resolve to loopback -- both must be allowed by default so
    # the frontend works regardless of which one it's opened through (see
    # backend/docs/integration-contract.md).
    resp = client.get("/api/graph", headers={"Origin": "http://127.0.0.1:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"


def test_cors_rejects_other_origin(client):
    resp = client.get("/api/graph", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in resp.headers
