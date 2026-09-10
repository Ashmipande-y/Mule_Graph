"""Multi-pattern rules engine orchestrator.

Coordinates all deterministic detection patterns:
1. Fan-out -> Convergence (fan_out_convergence)
2. Circular Transfer Loops (circular_transfer)
3. Rapid Forwarding Chains (rapid_forwarding)
4. Fan-In Collector Activity (fan_in_collector)
5. Unusual Reactivation After Dormancy (dormant_reactivation)

Provides cross-rule alert deduplication and unified configuration presets
for second-resolution demo fixtures vs. hour/day-resolution AML datasets.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from .circular import CircularConfig, detect_circular_transfers
from .detector import DetectorConfig, Finding, detect_fan_out_convergence
from .dormancy import DormancyConfig, detect_dormant_reactivation
from .fan_in import FanInConfig, detect_fan_in
from .fan_out_forwarding import FanOutForwardingConfig, detect_fan_out_forwarding
from .forwarding import ForwardingChainConfig, detect_forwarding_chains
from .transactions import Transaction


@dataclass(frozen=True)
class RulesEngineConfig:
    """Unified configuration for all detection patterns."""

    fan_out_convergence: DetectorConfig = field(default_factory=DetectorConfig)
    circular: CircularConfig = field(default_factory=CircularConfig.demo_preset)
    forwarding: ForwardingChainConfig = field(default_factory=ForwardingChainConfig.demo_preset)
    fan_in: FanInConfig = field(default_factory=FanInConfig.demo_preset)
    fan_out_forwarding: FanOutForwardingConfig = field(default_factory=FanOutForwardingConfig)
    dormancy: DormancyConfig = field(default_factory=DormancyConfig.demo_preset)

    enable_fan_out_convergence: bool = True
    enable_circular: bool = True
    enable_forwarding: bool = True
    enable_fan_in: bool = True
    enable_fan_out_forwarding: bool = True
    enable_dormancy: bool = True

    # Suppress standalone fan-in alert when the identical evidence is already
    # captured as the convergence phase of a fan-out/convergence ring.
    deduplicate_fan_in_against_convergence: bool = True

    @classmethod
    def demo_preset(cls) -> RulesEngineConfig:
        """Preset tuned for fast, second-resolution demo fixtures."""
        return cls(
            fan_out_convergence=DetectorConfig(
                min_intermediaries=3,
                fan_out_window_seconds=60,
                convergence_window_seconds=60,
                max_scoring_window_seconds=120,
            ),
            circular=CircularConfig.demo_preset(),
            forwarding=ForwardingChainConfig.demo_preset(),
            fan_in=FanInConfig.demo_preset(),
            dormancy=DormancyConfig.demo_preset(),
        )

    @classmethod
    def aml_preset(cls) -> RulesEngineConfig:
        """Preset tuned for multi-hour/day enterprise AML transfers."""
        return cls(
            fan_out_convergence=DetectorConfig(
                min_intermediaries=3,
                fan_out_window_seconds=6 * 3600,
                convergence_window_seconds=6 * 3600,
                max_scoring_window_seconds=24 * 3600,
            ),
            circular=CircularConfig.aml_preset(),
            forwarding=ForwardingChainConfig.aml_preset(),
            fan_in=FanInConfig.aml_preset(),
            dormancy=DormancyConfig.aml_preset(),
        )


def detect_all_patterns(
    transactions: Sequence[Transaction],
    config: RulesEngineConfig | None = None,
) -> list[Finding]:
    """Execute all enabled pattern detectors with cross-rule alert deduplication."""
    config = config or RulesEngineConfig.demo_preset()
    all_findings: list[Finding] = []

    # 1. Fan-out / Convergence
    foc_findings: list[Finding] = []
    if config.enable_fan_out_convergence:
        foc_findings = detect_fan_out_convergence(transactions, config=config.fan_out_convergence)
        all_findings.extend(foc_findings)

    if config.enable_fan_out_forwarding:
        partial_findings = detect_fan_out_forwarding(transactions, config=config.fan_out_forwarding)
        convergence_evidence = [set(f.evidence_transaction_ids) for f in foc_findings]
        all_findings.extend(
            finding
            for finding in partial_findings
            if not any(set(finding.evidence_transaction_ids).issubset(ids) for ids in convergence_evidence)
        )

    # 2. Circular Transfers
    if config.enable_circular:
        circular_findings = detect_circular_transfers(transactions, config=config.circular)
        all_findings.extend(circular_findings)

    # 3. Rapid Forwarding Chains
    if config.enable_forwarding:
        forwarding_findings = detect_forwarding_chains(transactions, config=config.forwarding)
        all_findings.extend(forwarding_findings)

    # 4. Fan-In Collector Activity
    if config.enable_fan_in:
        fan_in_findings = detect_fan_in(transactions, config=config.fan_in)

        # Cross-rule deduplication: suppress fan-in if fully subsumed by fan_out_convergence
        if config.deduplicate_fan_in_against_convergence and foc_findings:
            foc_convergence_tx_sets = {
                (f.collector_account, frozenset(f.convergence_transaction_ids))
                for f in foc_findings
            }
            deduped_fan_in: list[Finding] = []
            for fi in fan_in_findings:
                fi_tx_set = frozenset(fi.evidence_transaction_ids)
                collector = fi.collector_account
                # Check if this exact collector & transaction set was already alerted
                if (collector, fi_tx_set) in foc_convergence_tx_sets:
                    continue
                deduped_fan_in.append(fi)
            all_findings.extend(deduped_fan_in)
        else:
            all_findings.extend(fan_in_findings)

    # 5. Dormancy Reactivation
    if config.enable_dormancy:
        dormancy_findings = detect_dormant_reactivation(transactions, config=config.dormancy)
        all_findings.extend(dormancy_findings)

    return sorted(
        all_findings,
        key=lambda f: (-f.score, f.pattern, f.window_start),
    )
