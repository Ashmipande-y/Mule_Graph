"""In-memory persistent event bus and replay buffer for live updates.

Provides:
- Monotonic persistent event sequencing (event_id: 1, 2, 3...)
- In-memory thread-safe ring buffer for reconnect replay
- Detection of buffer overflow triggering full resync
- Async subscriber queues for SSE streaming with delivery lag tracking
- Workspace-scoped event delivery
"""

from __future__ import annotations

import asyncio
import datetime
from collections import deque
from dataclasses import dataclass, field
from threading import RLock
from uuid import uuid4
from typing import Any, Callable

MAX_BUFFER_SIZE = 1000


@dataclass(frozen=True)
class AppEvent:
    event_id: int
    event_type: str
    timestamp: str
    workspace_id: str
    data: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "workspace_id": self.workspace_id,
            "data": self.data,
        }

    def to_sse_message(self) -> str:
        import json

        data_str = json.dumps(self.to_dict())
        return f"id: {self.event_id}\nevent: {self.event_type}\ndata: {data_str}\n\n"


class EventBus:
    def __init__(self, max_buffer_size: int = MAX_BUFFER_SIZE) -> None:
        self._max_buffer_size = max_buffer_size
        self._lock = RLock()
        self.stream_id = uuid4().hex
        self._current_id = 0
        self._buffer: deque[AppEvent] = deque(maxlen=max_buffer_size)
        self._oldest_id = 1
        self._subscribers: set[tuple[str, asyncio.Queue[AppEvent], asyncio.AbstractEventLoop]] = set()
        self._total_published = 0
        self._last_event_time: datetime.datetime | None = None

    def publish(
        self,
        event_type: str,
        data: dict[str, Any],
        workspace_id: str = "default",
    ) -> AppEvent:
        now = datetime.datetime.now(datetime.timezone.utc)
        now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")

        with self._lock:
            self._current_id += 1
            event_id = self._current_id
            event = AppEvent(
                event_id=event_id,
                event_type=event_type,
                timestamp=now_iso,
                workspace_id=workspace_id,
                data=data,
            )
            self._buffer.append(event)
            if len(self._buffer) == self._max_buffer_size:
                self._oldest_id = self._buffer[0].event_id
            self._total_published += 1
            self._last_event_time = now

            # Enqueue deliveries in sequence order under the publication lock
            subscribers_snapshot = list(self._subscribers)

            # Dispatch to active async queues. publish() is called from both
            # async routes and sync `def` routes (the latter run in FastAPI's
            # threadpool, i.e. a different OS thread from the one that owns each
            # subscriber's event loop) -- asyncio.Queue is not thread-safe, so a
            # cross-thread put_nowait() races the loop's own bookkeeping. Always
            # marshal the put through the owning loop via call_soon_threadsafe,
            # which is safe to call from any thread, including the loop's own.
            for sub_workspace, q, loop in subscribers_snapshot:
                if sub_workspace == workspace_id or sub_workspace == "*":
                    try:
                        loop.call_soon_threadsafe(_safe_put_nowait, q, event)
                    except RuntimeError:
                        # A disconnect may close a loop after the subscriber snapshot.
                        with self._lock:
                            self._subscribers.discard((sub_workspace, q, loop))

        return event

    def get_events_since(
        self,
        since_id: int,
        workspace_id: str = "default",
    ) -> tuple[list[AppEvent], bool]:
        """Return events strictly after `since_id` for the given workspace.

        Returns: (events, resync_required)
        resync_required is True if since_id is older than the oldest buffered
        event, or if it refers to an event this (in-memory, process-lifetime)
        bus never produced -- e.g. the process restarted since the client
        last connected and the sequence reset. In either case we cannot
        prove the client saw everything between since_id and now, so we
        must not silently report "nothing missed".
        """
        with self._lock:
            latest_id = self._current_id

            if since_id > latest_id:
                return [], True

            if since_id == latest_id:
                return [], False

            oldest_available_id = self._buffer[0].event_id if self._buffer else None

            # Client is behind the buffer's retention horizon, or the buffer
            # holds nothing at all despite events having been published --
            # some events they need were evicted or were never retained.
            if since_id > 0 and (oldest_available_id is None or since_id < oldest_available_id - 1):
                return [], True

            matched: list[AppEvent] = [
                event
                for event in self._buffer
                if event.event_id > since_id and (event.workspace_id == workspace_id or workspace_id == "*")
            ]
            return matched, False

    def snapshot(self, since_id: int, workspace_id: str = "default", stream_id: str | None = None) -> dict:
        """Events and watermark from one lock boundary; epochs detect restarts."""
        with self._lock:
            events, resync = self.get_events_since(since_id, workspace_id)
            if stream_id and stream_id != self.stream_id:
                events, resync = [], True
            return {"events": [e.to_dict() for e in events], "resync_required": resync,
                    "latest_event_id": self._current_id, "stream_id": self.stream_id,
                    "workspace_id": workspace_id}

    def subscribe(
        self,
        workspace_id: str = "default",
        max_queue_size: int = 100,
    ) -> tuple[asyncio.Queue[AppEvent], Callable[[], None]]:
        """Subscribe to live events for a workspace.

        Must be called from within a running event loop (it is -- the only
        caller is app/api/events.py's async SSE generator): the loop is
        captured so publish() can safely deliver events from any thread.
        """
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[AppEvent] = asyncio.Queue(maxsize=max_queue_size)
        sub_entry = (workspace_id, queue, loop)

        with self._lock:
            self._subscribers.add(sub_entry)

        def unsubscribe() -> None:
            with self._lock:
                self._subscribers.discard(sub_entry)

        return queue, unsubscribe

    def get_stats(self) -> dict[str, Any]:
        with self._lock:
            active_listeners = len(self._subscribers)
            buffered_count = len(self._buffer)
            current_id = self._current_id
            oldest_id = self._buffer[0].event_id if self._buffer else 0
            last_event_time = (
                self._last_event_time.strftime("%Y-%m-%dT%H:%M:%SZ")
                if self._last_event_time
                else None
            )

        return {
            "active_listeners": active_listeners,
            "buffered_events_count": buffered_count,
            "current_event_id": current_id,
            "oldest_event_id": oldest_id,
            "total_published": self._total_published,
            "last_event_time": last_event_time,
        }

    def reset_for_tests(self) -> None:
        """Reset internal buffer and sequence for isolated test runs."""
        with self._lock:
            self._current_id = 0
            self._oldest_id = 1
            self._buffer.clear()
            self._subscribers.clear()
            self._total_published = 0
            self._last_event_time = None
            self.stream_id = uuid4().hex


def _safe_put_nowait(q: asyncio.Queue[AppEvent], event: AppEvent) -> None:
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        # Signal loss rather than quietly letting a consumer become stale.
        while not q.empty():
            q.get_nowait()
        q.put_nowait(AppEvent(event.event_id, "resync", event.timestamp, event.workspace_id,
                            {"reason": "slow_consumer", "latest_event_id": event.event_id}))


# Global singleton instance
_default_bus = EventBus()


def get_event_bus() -> EventBus:
    return _default_bus
