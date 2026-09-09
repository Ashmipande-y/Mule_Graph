import { afterEach, describe, expect, it, vi } from "vitest";
import { useConsoleStore } from "./consoleStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useConsoleStore.setState({
    liveStatus: "idle",
    liveGraph: null,
    liveFindings: [],
    liveError: null,
    liveRevision: 0,
    liveEvaluatedAt: null,
  });
});

describe("consoleStore.actions.fetchLive: overlapping requests", () => {
  it("a late-resolving earlier fetch never overwrites a newer fetch's already-applied result", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { fetchLive } = useConsoleStore.getState().actions;
    const firstCall = fetchLive();
    const secondCall = fetchLive();

    // The newer (second) request resolves first...
    second.resolve(
      okResponse({ nodes: [{ id: "ACC_NEW", label: "New", risk_score: null, risk_level: "UNASSESSED" }], edges: [] }),
    );
    await secondCall;
    expect(useConsoleStore.getState().liveGraph?.nodes.map((n) => n.id)).toEqual(["ACC_NEW"]);
    expect(useConsoleStore.getState().liveRevision).toBe(1);

    // ...then the older (first, now-superseded) request finally resolves too.
    // It must be discarded, not overwrite the newer result already applied.
    first.resolve(
      okResponse({ nodes: [{ id: "ACC_OLD", label: "Old", risk_score: null, risk_level: "UNASSESSED" }], edges: [] }),
    );
    await firstCall;

    const finalState = useConsoleStore.getState();
    expect(finalState.liveGraph?.nodes.map((n) => n.id)).toEqual(["ACC_NEW"]);
    expect(finalState.liveStatus).toBe("ready");
    expect(finalState.liveRevision).toBe(1); // not bumped again by the discarded stale result
  });

  it("a late-resolving superseded fetch's failure does not show as the current error", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { fetchLive } = useConsoleStore.getState().actions;
    const firstCall = fetchLive();
    const secondCall = fetchLive();

    second.resolve(okResponse({ nodes: [], edges: [] }));
    await secondCall;
    expect(useConsoleStore.getState().liveStatus).toBe("ready");

    // The older, superseded request fails after the newer one already succeeded.
    first.reject(new TypeError("fetch failed"));
    await firstCall;

    const finalState = useConsoleStore.getState();
    expect(finalState.liveStatus).toBe("ready");
    expect(finalState.liveError).toBeNull();
  });

  it("each successfully-applied fetch bumps liveRevision and liveEvaluatedAt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ nodes: [], edges: [] })));
    const { fetchLive } = useConsoleStore.getState().actions;

    await fetchLive();
    const afterFirst = useConsoleStore.getState();
    expect(afterFirst.liveRevision).toBe(1);
    expect(afterFirst.liveEvaluatedAt).not.toBeNull();

    await fetchLive();
    expect(useConsoleStore.getState().liveRevision).toBe(2);
  });
});
