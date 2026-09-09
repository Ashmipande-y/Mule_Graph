import pytest

from app import config


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    # get_settings() is @lru_cache(maxsize=1); every test below changes the
    # inputs it reads (ENV_PATH, os.environ), so the cache must not survive
    # between tests -- or across this fixture's own before/after.
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()


def _clear_recognized_env(monkeypatch):
    for key in config._RECOGNIZED_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_defaults_when_no_env_file_and_no_process_env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ENV_PATH", tmp_path / "does-not-exist.env")
    _clear_recognized_env(monkeypatch)

    settings = config.get_settings()

    assert settings.cors_origins == config.DEFAULT_CORS_ORIGINS
    assert settings.log_level == "INFO"
    assert settings.demo_transactions_path == config.REPO_ROOT / "data" / "demo_transactions.json"


def test_env_file_overrides_default(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("LOG_LEVEL=DEBUG\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_PATH", env_file)
    _clear_recognized_env(monkeypatch)

    settings = config.get_settings()

    assert settings.log_level == "DEBUG"


def test_process_env_overrides_env_file(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("LOG_LEVEL=DEBUG\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_PATH", env_file)
    monkeypatch.setenv("LOG_LEVEL", "WARNING")

    settings = config.get_settings()

    assert settings.log_level == "WARNING"


def test_process_env_applies_even_without_an_env_file(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ENV_PATH", tmp_path / "does-not-exist.env")
    monkeypatch.setenv("CORS_ORIGINS", "http://example.test")

    settings = config.get_settings()

    assert settings.cors_origins == ["http://example.test"]


def test_process_env_overrides_env_file_for_a_path_setting(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("DEMO_TRANSACTIONS_PATH=from_file.json\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_PATH", env_file)
    override_path = tmp_path / "from_env.json"
    monkeypatch.setenv("DEMO_TRANSACTIONS_PATH", str(override_path))

    settings = config.get_settings()

    assert settings.demo_transactions_path == override_path


def test_unrecognized_process_env_vars_are_not_picked_up(monkeypatch, tmp_path):
    # Only the documented setting names may flow from the process
    # environment into Settings -- an unrelated variable (PATH-like noise)
    # must never leak in just because it happens to be set.
    monkeypatch.setattr(config, "ENV_PATH", tmp_path / "does-not-exist.env")
    _clear_recognized_env(monkeypatch)
    monkeypatch.setenv("SOME_UNRELATED_VARIABLE", "should not affect settings")

    settings = config.get_settings()

    assert settings == config.Settings()


def test_env_file_values_not_overridden_when_process_env_unset(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("CORS_ORIGINS=http://from-file.test\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_PATH", env_file)
    _clear_recognized_env(monkeypatch)

    settings = config.get_settings()

    assert settings.cors_origins == ["http://from-file.test"]
