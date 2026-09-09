from app.services.metrics import (
    get_metrics_collector,
    mask_account_id,
    sanitize_transaction_for_logging,
)


def test_mask_account_id():
    assert mask_account_id("ACC_VICTIM") == "ACC_***TIM"
    assert mask_account_id("ACC_A") == "ACC_***A"
    assert mask_account_id("9876543210") == "***3210"
    assert mask_account_id(None) == "UNKNOWN"


def test_sanitize_transaction_for_logging():
    raw = {
        "id": "TX_999",
        "sender": "ACC_SENDER",
        "receiver": "ACC_RECEIVER",
        "amount_paise": 50000,
        "raw_secret_payload": "secret_data",
    }
    sanitized = sanitize_transaction_for_logging(raw)
    assert sanitized["id"] == "TX_999"
    assert sanitized["amount"] == 50000
    assert "ACC_***DER" in sanitized["sender"]
    assert "ACC_***VER" in sanitized["receiver"]
    assert "raw_secret_payload" not in sanitized


def test_operational_metrics_endpoint(client):
    # Perform a request to populate metrics
    client.get("/health")
    client.get("/api/graph")

    res = client.get("/api/operations/metrics")
    assert res.status_code == 200
    body = res.json()
    assert "request_latencies" in body
    assert "analysis_durations" in body
    assert "ingestion_failures" in body
    assert "job_backlog" in body
    assert "event_metrics" in body
    assert "/health" in body["request_latencies"]
