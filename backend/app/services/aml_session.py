"""In-memory, per-process session store for analyst-committed AML transactions.

Session-local by design: resets when the backend process restarts, and has
no multi-user isolation -- consistent with the rest of this backend's
"in-memory demo state" approach (see backend/README.md's Stage 2 notes on
runtime storage). A transaction lands here only via the explicit
`POST /api/aml/session/transactions` commit step, never as a side effect of
`POST /api/aml/assess` (which only scores, and never mutates this store --
see backend/docs/aml-integration-contract.md for why assessment and
commitment are kept as two separate, explicit actions).
"""

from __future__ import annotations

from app.services.aml_types import AmlRecord

_session_records: list[AmlRecord] = []
_session_ids: set[str] = set()


def get_session_records() -> list[AmlRecord]:
    return list(_session_records)


def get_session_ids() -> set[str]:
    return set(_session_ids)


def commit(record: AmlRecord) -> None:
    _session_records.append(record)
    _session_ids.add(record.id)


def reset() -> None:
    """Clears all session-committed transactions. Test/manual-reset only --
    not exposed via any API route."""
    _session_records.clear()
    _session_ids.clear()
