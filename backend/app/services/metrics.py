"""Operational measurements, structured metrics, and privacy-preserving log sanitization.

Tracks:
- Request latency percentiles (p50, p95, p99, total count, error counts)
- Analysis durations for rules evaluation and ML scoring
- Ingestion failures counter (schema invalidity, duplicate conflicts)
- Active job backlog and event lag
- Privacy filter masking sensitive account IDs and payloads in routine logs
"""

from __future__ import annotations

import math
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Any


def mask_account_id(account_id: str | None) -> str:
    """Mask account identifier for routine log privacy.

    Examples:
    'ACC_VICTIM' -> 'ACC_***TIM'
    'ACC_A' -> 'ACC_***A'
    '1234567890' -> '******7890'
    """
    if not account_id:
        return "UNKNOWN"
    s = str(account_id)
    if len(s) <= 4:
        return "***" + s[-1:]
    if s.startswith("ACC_"):
        suffix = s[4:]
        if len(suffix) <= 2:
            return f"ACC_***{suffix}"
        return f"ACC_***{suffix[-3:]}"
    return f"***{s[-4:]}"


def sanitize_transaction_for_logging(record: dict[str, Any]) -> dict[str, Any]:
    """Sanitize transaction record for routine INFO logging.

    Preserves operational debugging fields (id, amount, timestamp, payment_format)
    while masking sensitive counterparty identifiers and stripping raw payload bodies.
    """
    amount = record.get("amount")
    if amount is None:
        amount = record.get("amount_paise")
    sanitized: dict[str, Any] = {
        "id": record.get("id"),
        "amount": amount,
        "timestamp": record.get("timestamp"),
        "payment_format": record.get("payment_format"),
    }
    if "sender" in record:
        sanitized["sender"] = mask_account_id(record["sender"])
    if "receiver" in record:
        sanitized["receiver"] = mask_account_id(record["receiver"])
    return sanitized


class MetricsCollector:
    def __init__(self, max_samples: int = 500) -> None:
        self._max_samples = max_samples
        self._lock = Lock()
        self._request_latencies: dict[str, deque[float]] = defaultdict(
            lambda: deque(maxlen=max_samples)
        )
        self._request_counts: dict[str, int] = defaultdict(int)
        self._error_counts: dict[str, int] = defaultdict(int)

        self._analysis_durations: dict[str, deque[float]] = defaultdict(
            lambda: deque(maxlen=max_samples)
        )
        self._ingestion_failures: dict[str, int] = defaultdict(int)
        self._start_time = time.time()

    def record_request(self, path: str, duration_ms: float, status_code: int) -> None:
        """`path` must already be normalized (a route path template, not a
        literal URL with resource ids in it) -- see app/main.py's metrics
        middleware, which passes the matched route's path template."""
        with self._lock:
            self._request_latencies[path].append(duration_ms)
            self._request_counts[path] += 1
            if status_code >= 400:
                self._error_counts[path] += 1

    def record_analysis_duration(self, operation: str, duration_ms: float) -> None:
        with self._lock:
            self._analysis_durations[operation].append(duration_ms)

    def record_ingestion_failure(self, reason: str) -> None:
        with self._lock:
            self._ingestion_failures[reason] += 1

    def _calculate_percentiles(self, samples: deque[float]) -> dict[str, float]:
        if not samples:
            return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "avg": 0.0}
        sorted_samples = sorted(samples)
        n = len(sorted_samples)

        def pct(p: float) -> float:
            k = (n - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return sorted_samples[int(k)]
            d0 = sorted_samples[int(f)] * (c - k)
            d1 = sorted_samples[int(c)] * (k - f)
            return d0 + d1

        return {
            "p50": round(pct(0.50), 2),
            "p95": round(pct(0.95), 2),
            "p99": round(pct(0.99), 2),
            "avg": round(sum(sorted_samples) / n, 2),
        }

    def get_operational_metrics(self) -> dict[str, Any]:
        uptime_seconds = round(time.time() - self._start_time, 1)

        with self._lock:
            route_metrics = {}
            for path, latencies in self._request_latencies.items():
                pcts = self._calculate_percentiles(latencies)
                total = self._request_counts[path]
                errors = self._error_counts[path]
                route_metrics[path] = {
                    "total_requests": total,
                    "error_count": errors,
                    "error_rate_pct": round((errors / total * 100) if total else 0.0, 2),
                    "latency_ms": pcts,
                }

            analysis_metrics = {}
            for op, durations in self._analysis_durations.items():
                analysis_metrics[op] = {
                    "count": len(durations),
                    "duration_ms": self._calculate_percentiles(durations),
                }

            failures = dict(self._ingestion_failures)

        # Re-import dynamically to prevent circular import
        from app.services.event_bus import get_event_bus

        bus_stats = get_event_bus().get_stats()

        return {
            "uptime_seconds": uptime_seconds,
            "request_latencies": route_metrics,
            "analysis_durations": analysis_metrics,
            "ingestion_failures": failures,
            "job_backlog": {
                "active_sse_subscribers": bus_stats["active_listeners"],
                "buffered_events_count": bus_stats["buffered_events_count"],
            },
            "event_metrics": bus_stats,
        }

    def reset_for_tests(self) -> None:
        with self._lock:
            self._request_latencies.clear()
            self._request_counts.clear()
            self._error_counts.clear()
            self._analysis_durations.clear()
            self._ingestion_failures.clear()
            self._start_time = time.time()


_collector = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    return _collector
