import { describe, it, expect, vi } from "vitest";
import { LiveUpdatesClient } from "./liveUpdates";

describe("LiveUpdatesClient", () => {
  it("deduplicates identical incoming events by event_id", () => {
    const onCommitted = vi.fn();
    const client = new LiveUpdatesClient({
      baseUrl: "http://localhost:8000",
      onTransactionCommitted: onCommitted,
    });

    const event1 = {
      event_id: 101,
      event_type: "transaction_committed",
      timestamp: "2026-09-09T10:00:00Z",
      workspace_id: "default",
      data: { transaction_id: "TX_101", sender_masked: "ACC_***A", receiver_masked: "ACC_***B" },
    };

    // First arrival
    client["handleRawMessage"](JSON.stringify(event1));
    expect(onCommitted).toHaveBeenCalledTimes(1);

    // Duplicate arrival
    client["handleRawMessage"](JSON.stringify(event1));
    expect(onCommitted).toHaveBeenCalledTimes(1); // Still 1, not duplicated!

    expect(client.getLastEventId()).toBe(101);
  });

  it("suppresses duplicate UI notifications for unchanged status", () => {
    const client = new LiveUpdatesClient({ baseUrl: "http://localhost:8000" });

    expect(client.shouldNotify("case_123", "investigating")).toBe(true);
    expect(client.shouldNotify("case_123", "investigating")).toBe(false); // Repeated, suppressed!
    expect(client.shouldNotify("case_123", "frozen")).toBe(true); // Changed status, allowed!
  });

  it("handles resync requirement signal", () => {
    const onResync = vi.fn();
    const client = new LiveUpdatesClient({
      baseUrl: "http://localhost:8000",
      onResyncRequired: onResync,
    });

    const resyncEvent = {
      event_id: 999,
      event_type: "resync",
      timestamp: "2026-09-09T10:00:00Z",
      workspace_id: "default",
      data: { reason: "buffer_overflow" },
    };

    client["handleRawMessage"](JSON.stringify(resyncEvent));
    expect(onResync).toHaveBeenCalledWith("buffer_overflow");
  });
});
