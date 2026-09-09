def test_liveness_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_readiness_probe_all_dependencies(client):
    from app.config import get_settings

    res = client.get("/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert "checks" in data
    assert data["checks"]["demo_transactions"] == "ok"
    assert data["checks"]["rules_engine"] == "ok"
    assert data["checks"]["event_bus"] == "ok"

    # AML dataset is optional (AML_MODE=optional) -- readiness must stay
    # "ready" either way, only the individual check differs, so this
    # assertion holds on a fresh checkout without the CSV populated too.
    aml_present = get_settings().aml_transfers_path.exists()
    expected_aml_check = "ok" if aml_present else "warning: optional AML dataset not present"
    assert data["checks"]["aml_dataset"] == expected_aml_check
