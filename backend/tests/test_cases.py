import json
import pytest
from app.config import REPO_ROOT
from app.main import app
from app.services.case_service import CaseService, get_case_service
from app.services.event_bus import get_event_bus

@pytest.fixture(autouse=True)
def isolated_cases(tmp_path):
    service = CaseService(tmp_path / "cases.sqlite3")
    app.dependency_overrides[get_case_service] = lambda: service
    get_event_bus().reset_for_tests()
    yield service
    app.dependency_overrides.pop(get_case_service, None)

def payload():
    return {
        "transactions": json.loads((REPO_ROOT / "data/demo_transactions.json").read_text()),
        "source_account": "ACC_A", "collector_account": "ACC_X",
        "intermediary_accounts": ["ACC_B", "ACC_C", "ACC_D"],
    }

def test_evidence_assessment_case_decision_and_event_workflow(client, isolated_cases):
    source = payload()
    assessment = client.post("/api/assess", json={"transactions": source["transactions"]}).json()
    created = client.post("/api/cases", json=source)
    assert created.status_code == 200
    case = created.json()
    assert case["finding"] == assessment["findings"][0]
    assert case["graph"]["findings"][0] == case["finding"]
    assert len(case["transactions"]) == 7
    watermark = client.get("/api/events/poll").json()["latest_event_id"]
    updated = client.post(f'/api/cases/{case["case_id"]}/status',
                          json={"status": "investigating", "expected_revision": 1, "note": "Reviewed all six evidence transfers."})
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    events = client.get(f"/api/events/poll?since_id={watermark}").json()["events"]
    assert len(events) == 1 and events[0]["event_type"] == "case_updated"
    assert events[0]["data"]["revision"] == 2
    # New service instance simulates restart: evidence and decisions survive.
    reloaded = CaseService(isolated_cases.path).get_case(case["case_id"])
    assert reloaded == updated.json()
    assert reloaded["notes"][0]["text"] == "Reviewed all six evidence transfers."

def test_idempotent_open_preserves_decisions_and_snapshot_identity(client):
    source = payload()
    case = client.post("/api/cases", json=source).json()
    client.post(f'/api/cases/{case["case_id"]}/status', json={"status": "closed", "expected_revision": 1})
    source["transactions"].reverse()
    again = client.post("/api/cases", json=source).json()
    assert again["case_id"] == case["case_id"]
    assert again["status"] == "closed"
    source["transactions"][0]["amount"] += 1
    changed = client.post("/api/cases", json=source).json()
    assert changed["case_id"] != case["case_id"]

def test_unverified_evidence_cannot_create_case(client):
    source = payload()
    source["transactions"] = source["transactions"][:2]
    assert client.post("/api/cases", json=source).status_code == 422
    assert client.get("/api/cases").json() == []

def test_case_workspace_reads_writes_and_events_are_scoped(client):
    case = client.post("/api/cases?workspace_id=ws_alice", json=payload()).json()
    assert client.get("/api/cases").json() == []
    assert client.get(f'/api/cases/{case["case_id"]}').status_code == 404
    assert client.post(f'/api/cases/{case["case_id"]}/status',
                       json={"status": "closed", "expected_revision": 1}).status_code == 404
    assert client.get("/api/events/poll").json()["events"] == []
    assert len(client.get("/api/events/poll?workspace_id=ws_alice").json()["events"]) == 1

def test_invalid_status_transition_and_stale_revision_are_rejected(client):
    case = client.post("/api/cases", json=payload()).json()
    url = f'/api/cases/{case["case_id"]}/status'
    assert client.post(url, json={"status": "garbage", "expected_revision": 1}).status_code == 422
    assert client.post(url, json={"status": "closed", "expected_revision": 1}).status_code == 200
    stale = client.post(url, json={"status": "investigating", "expected_revision": 1, "note": "stale write"})
    assert stale.status_code == 409
    assert client.post(url, json={"status": "flagged", "expected_revision": 2}).status_code == 422
    assert client.get(f'/api/cases/{case["case_id"]}').json()["notes"] == []
    assert client.post(url, json={"status": "investigating", "expected_revision": 2}).status_code == 200

