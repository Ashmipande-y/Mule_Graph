"""Stage 1: deterministic, CPU-only explainable rules engine for MuleGraph.

This package is intentionally independent of FastAPI, any database, and the
frontend. It only depends on the Python standard library and operates on
plain Transaction records, so it can be imported and tested without the rest
of the application running.
"""

from .account_risk import (
    AccountRisk,
    account_risk_from_findings,
    risk_level_for_score,
)
from .circular import CircularConfig, detect_circular_transfers
from .detector import DetectorConfig, Finding, detect_fan_out_convergence
from .dormancy import DormancyConfig, detect_dormant_reactivation
from .engine import RulesEngineConfig, detect_all_patterns
from .fan_in import FanInConfig, detect_fan_in
from .fan_out_forwarding import FanOutForwardingConfig, detect_fan_out_forwarding
from .forwarding import ForwardingChainConfig, detect_forwarding_chains
from .replay import evaluate_all_at, evaluate_at, observable_transactions
from .transactions import Transaction, deduplicate_by_id, load_transactions

__all__ = [
    "AccountRisk",
    "CircularConfig",
    "DetectorConfig",
    "DormancyConfig",
    "FanInConfig",
    "FanOutForwardingConfig",
    "Finding",
    "ForwardingChainConfig",
    "RulesEngineConfig",
    "Transaction",
    "account_risk_from_findings",
    "deduplicate_by_id",
    "detect_all_patterns",
    "detect_circular_transfers",
    "detect_dormant_reactivation",
    "detect_fan_in",
    "detect_fan_out_forwarding",
    "detect_fan_out_convergence",
    "detect_forwarding_chains",
    "evaluate_all_at",
    "evaluate_at",
    "load_transactions",
    "observable_transactions",
    "risk_level_for_score",
]
