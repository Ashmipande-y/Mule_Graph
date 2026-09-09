"""SQLite evidence snapshots and revision-checked investigation decisions.

Events are refresh hints, not storage. Workspace labels are not authentication.
"""
from __future__ import annotations
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from app.config import get_settings
from app.services.event_bus import get_event_bus

TRANSITIONS = {
    "new": {"investigating", "flagged", "closed"},
    "investigating": {"flagged", "closed"},
    "flagged": {"investigating", "closed"},
    "closed": {"investigating"},
}

class CaseConflict(ValueError):
    pass

class CaseService:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS cases (
                workspace TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
                PRIMARY KEY (workspace, id))""")

    @contextmanager
    def _connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def list_cases(self, workspace_id: str = "default") -> list[dict]:
        with self._connection() as db:
            rows = db.execute("SELECT body FROM cases WHERE workspace=?", (workspace_id,)).fetchall()
        return sorted((json.loads(row[0]) for row in rows), key=lambda c: (c["updated_at"], c["case_id"]), reverse=True)

    def get_case(self, case_id: str, workspace_id: str = "default") -> dict | None:
        with self._connection() as db:
            row = db.execute("SELECT body FROM cases WHERE workspace=? AND id=?", (workspace_id, case_id)).fetchone()
        return json.loads(row[0]) if row else None

    def open_case(self, graph: dict, transactions: list[dict], finding: dict, workspace_id: str = "default") -> dict:
        # Stable snapshot identity includes values, not just reused transaction IDs.
        transactions = sorted(transactions, key=lambda t: (t["timestamp"], t["id"]))
        identity = json.dumps({"transactions": transactions, "finding": finding}, sort_keys=True, separators=(",", ":"))
        case_id = "CASE_" + hashlib.sha256(identity.encode()).hexdigest()[:24]
        now = datetime.now(timezone.utc).isoformat()
        case = {
            "case_id": case_id, "workspace_id": workspace_id,
            "title": f'{finding["source_account"]} → {finding["collector_account"]}',
            "account_ids": [finding["source_account"], *finding["intermediary_accounts"], finding["collector_account"]],
            "pattern": finding["pattern"], "status": "new", "revision": 1,
            "notes": [], "history": [], "created_at": now, "updated_at": now,
            "finding": finding, "graph": graph, "transactions": transactions,
        }
        with self._connection() as db:
            inserted = db.execute("INSERT OR IGNORE INTO cases VALUES (?, ?, ?)", (workspace_id, case_id, json.dumps(case))).rowcount
            case = json.loads(db.execute("SELECT body FROM cases WHERE workspace=? AND id=?", (workspace_id, case_id)).fetchone()[0])
        if inserted:
            self._publish(case, None, "analyst", None)
        return case

    def update_case_status(self, case_id: str, new_status: str, expected_revision: int,
                           author: str = "analyst", note_text: str | None = None, workspace_id: str = "default") -> dict:
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM cases WHERE workspace=? AND id=?", (workspace_id, case_id)).fetchone()
            if not row:
                raise KeyError(case_id)
            case = json.loads(row[0])
            if case["revision"] != expected_revision:
                raise CaseConflict("Case changed in another session. Refresh and review before saving again.")
            previous = case["status"]
            if new_status not in TRANSITIONS or (new_status != previous and new_status not in TRANSITIONS[previous]):
                raise ValueError(f"Invalid case transition: {previous} → {new_status}")
            note_text = (note_text or "").strip()
            if new_status == previous and not note_text:
                return case
            now = datetime.now(timezone.utc).isoformat()
            case.update(status=new_status, updated_at=now, revision=case["revision"] + 1)
            if note_text:
                case["notes"].append({"id": f'NOTE_{case["revision"]}', "author": author, "text": note_text, "created_at": now})
            case["history"].append({"previous_status": previous, "status": new_status, "author": author, "note": note_text or None, "created_at": now})
            db.execute("UPDATE cases SET body=? WHERE workspace=? AND id=?", (json.dumps(case), workspace_id, case_id))
        self._publish(case, previous, author, note_text or None)
        return case

    @staticmethod
    def _publish(case: dict, previous: str | None, author: str, note: str | None):
        get_event_bus().publish("case_updated", {
            "case_id": case["case_id"], "previous_status": previous, "new_status": case["status"],
            "account_ids": case["account_ids"], "updated_at": case["updated_at"],
            "revision": case["revision"], "author": author, "note": note,
        }, workspace_id=case["workspace_id"])

@lru_cache(maxsize=8)
def _service_for(path: Path) -> CaseService:
    return CaseService(path)

def get_case_service() -> CaseService:
    return _service_for(get_settings().case_db_path)

