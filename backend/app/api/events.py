"""SSE notifications and cursor-based polling. Workspace labels are demo scopes."""
from __future__ import annotations
import asyncio
import json
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from app.services.event_bus import get_event_bus

router = APIRouter(prefix="/api/events")
ALLOWED_WORKSPACES = {"default", "analytics", "compliance", "*"}

def validate_workspace(workspace_id: str) -> str:
    ws = (workspace_id or "default").strip()
    if len(ws) > 100 or (ws not in ALLOWED_WORKSPACES and not ws.startswith("ws_")):
        raise HTTPException(403, "Unknown workspace scope.")
    return ws

@router.get("", response_class=StreamingResponse)
async def stream_events(request: Request, last_event_id: str | None = Header(default=None),
                        x_workspace_id: str | None = Header(default=None),
                        since_id: int = Query(default=0, ge=0), workspace_id: str = "default",
                        stream_id: str | None = None):
    ws = validate_workspace(x_workspace_id or workspace_id)
    resume = int(last_event_id) if last_event_id and last_event_id.isdigit() else since_id
    bus = get_event_bus()

    async def generate():
        # Subscribe first: concurrent publications can be replayed and queued;
        # cursor filtering below removes duplicates without a delivery gap.
        queue, unsubscribe = bus.subscribe(ws)
        cursor = resume
        try:
            snapshot = bus.snapshot(resume, ws, stream_id)
            if snapshot["resync_required"]:
                cursor = snapshot["latest_event_id"]
                yield "event: resync\ndata: " + json.dumps({**snapshot, "reason": "cursor_reset"}) + "\n\n"
            else:
                for event in snapshot["events"]:
                    cursor = event["event_id"]
                    yield f'id: {cursor}\nevent: {event["event_type"]}\ndata: {json.dumps(event)}\n\n'
            cursor = snapshot["latest_event_id"]
            yield "event: cursor\ndata: " + json.dumps({"stream_id": bus.stream_id, "latest_event_id": cursor}) + "\n\n"
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    if event.event_id <= cursor:
                        continue
                    if event.event_type == "resync":
                        snapshot = bus.snapshot(0, ws)
                        cursor = snapshot["latest_event_id"]
                        yield "event: resync\ndata: " + json.dumps({"reason": "slow_consumer", "stream_id": bus.stream_id, "latest_event_id": cursor}) + "\n\n"
                    else:
                        cursor = event.event_id
                        yield event.to_sse_message()
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            unsubscribe()
    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@router.get("/poll")
def poll_events(since_id: int = Query(default=0, ge=0), x_workspace_id: str | None = Header(default=None),
                workspace_id: str = "default", stream_id: str | None = None):
    return get_event_bus().snapshot(since_id, validate_workspace(x_workspace_id or workspace_id), stream_id)
