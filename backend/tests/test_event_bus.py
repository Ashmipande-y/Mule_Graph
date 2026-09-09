import pytest
from app.services.event_bus import EventBus


def test_monotonic_event_sequencing():
    bus = EventBus(max_buffer_size=10)
    e1 = bus.publish("test_event", {"val": 1}, workspace_id="default")
    e2 = bus.publish("test_event", {"val": 2}, workspace_id="default")
    e3 = bus.publish("test_event", {"val": 3}, workspace_id="default")

    assert e1.event_id == 1
    assert e2.event_id == 2
    assert e3.event_id == 3


def test_replay_missed_events_since_id():
    bus = EventBus(max_buffer_size=10)
    for i in range(1, 6):
        bus.publish("commit", {"tx": f"TX_{i}"}, workspace_id="default")

    # Client was at event_id=2, missed 3, 4, 5
    missed, resync_required = bus.get_events_since(2, workspace_id="default")
    assert resync_required is False
    assert len(missed) == 3
    assert [e.event_id for e in missed] == [3, 4, 5]


def test_buffer_overflow_signals_resync():
    # Small buffer of 3 events
    bus = EventBus(max_buffer_size=3)
    bus.publish("ev", {"n": 1})
    bus.publish("ev", {"n": 2})
    bus.publish("ev", {"n": 3})
    bus.publish("ev", {"n": 4})  # Drops 1; buffer now holds 2, 3, 4

    # Client asks for since_id=1 (older than oldest in buffer, which is 2)
    # oldest is 2, since_id=0 means start, since_id=1 is older than buffer horizon
    missed, resync_required = bus.get_events_since(0, workspace_id="default")
    assert resync_required is False  # 0 means fresh start without resume

    # If client asks since_id=1 (which was evicted)
    bus.publish("ev", {"n": 5})  # buffer holds 3, 4, 5. oldest is 3.
    missed, resync_required = bus.get_events_since(1, workspace_id="default")
    assert resync_required is True


def test_workspace_isolation():
    bus = EventBus(max_buffer_size=10)
    bus.publish("ev_ws1", {"secret": "A"}, workspace_id="workspace_1")
    bus.publish("ev_ws2", {"secret": "B"}, workspace_id="workspace_2")

    events_ws1, _ = bus.get_events_since(0, workspace_id="workspace_1")
    assert len(events_ws1) == 1
    assert events_ws1[0].data["secret"] == "A"

    events_ws2, _ = bus.get_events_since(0, workspace_id="workspace_2")
    assert len(events_ws2) == 1
    assert events_ws2[0].data["secret"] == "B"


def test_poll_events_endpoint(client):
    from app.services.event_bus import get_event_bus

    bus = get_event_bus()
    bus.reset_for_tests()
    bus.publish("test_poll", {"msg": "hello"}, workspace_id="default")

    res = client.get("/api/events/poll?since_id=0")
    assert res.status_code == 200
    body = res.json()
    assert body["resync_required"] is False
    assert len(body["events"]) >= 1
    assert body["events"][0]["data"]["msg"] == "hello"


def test_unauthorized_workspace_rejected(client):
    res = client.get("/api/events/poll?workspace_id=malicious_workspace_unknown")
    assert res.status_code == 403


def test_epoch_detects_restart_even_if_sequence_has_caught_up():
    old = EventBus()
    old.publish("case_updated", {})
    restarted = EventBus()
    restarted.publish("case_updated", {})
    restarted.publish("case_updated", {})
    snapshot = restarted.snapshot(1, stream_id=old.stream_id)
    assert snapshot["resync_required"] is True
    assert snapshot["latest_event_id"] == 2
    assert snapshot["events"] == []


def test_worker_thread_delivery_and_slow_consumer_resync():
    import asyncio

    def _peek(queue):
        # asyncio.Queue has no public peek. publish() only *schedules*
        # cross-thread delivery via call_soon_threadsafe and gives no
        # ordering guarantee between that callback and a to_thread() call's
        # own completion (observed: assuming FIFO ordering between the two
        # made this test flaky, and merely polling queue size was *also*
        # insufficient -- size was already 1 from the prior delivery before
        # the next callback ran, so the wait returned immediately without
        # actually waiting for the overflow handling). Inspecting the head
        # item itself is the only way to wait for the *specific* delivery
        # we actually care about, without consuming a value the assertions
        # below still need.
        return queue._queue[0] if queue._queue else None

    async def wait_until(predicate, timeout=1.0):
        deadline = asyncio.get_event_loop().time() + timeout
        while not predicate():
            if asyncio.get_event_loop().time() >= deadline:
                raise AssertionError("condition not met within timeout")
            await asyncio.sleep(0)

    async def run():
        bus = EventBus()
        queue, unsubscribe = bus.subscribe(max_queue_size=1)
        await asyncio.to_thread(bus.publish, "case_updated", {"revision": 1})
        event = await asyncio.wait_for(queue.get(), 1)
        assert event.data["revision"] == 1

        await asyncio.to_thread(bus.publish, "case_updated", {"revision": 2})
        await wait_until(lambda: (item := _peek(queue)) is not None and item.data.get("revision") == 2)

        await asyncio.to_thread(bus.publish, "case_updated", {"revision": 3})
        await wait_until(lambda: (item := _peek(queue)) is not None and item.event_type == "resync")

        event = await asyncio.wait_for(queue.get(), 1)
        assert event.event_type == "resync"
        unsubscribe()
        assert bus.get_stats()["active_listeners"] == 0
    asyncio.run(run())


def test_sse_subscribes_before_replay_and_filters_duplicate_delivery(monkeypatch):
    import asyncio
    from app.api import events

    class Request:
        async def is_disconnected(self):
            return False

    async def run():
        bus = EventBus()
        monkeypatch.setattr(events, "get_event_bus", lambda: bus)
        original_snapshot = bus.snapshot
        def racing_snapshot(*args, **kwargs):
            assert bus.get_stats()["active_listeners"] == 1
            bus.publish("case_updated", {"revision": 1})
            return original_snapshot(*args, **kwargs)
        monkeypatch.setattr(bus, "snapshot", racing_snapshot)
        response = await events.stream_events(Request(), None, None, 0, "default", None)
        iterator = response.body_iterator
        first = await anext(iterator)
        assert "event: case_updated\n" in first and "id: 1\n" in first
        assert "event: cursor\n" in await anext(iterator)
        await asyncio.to_thread(bus.publish, "case_updated", {"revision": 2})
        second = await asyncio.wait_for(anext(iterator), 1)
        assert "id: 2\n" in second
        await iterator.aclose()
        assert bus.get_stats()["active_listeners"] == 0
    asyncio.run(run())
