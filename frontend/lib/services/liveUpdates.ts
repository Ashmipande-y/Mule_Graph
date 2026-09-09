import type { ConnectionStatus, LiveEventEnvelope, TransactionCommittedData, AssessmentCompletedData, CaseUpdatedData } from "@/types/event";

export interface LiveUpdatesConfig {
  baseUrl: string;
  workspaceId?: string;
  onStatusChange?: (status: ConnectionStatus) => void;
  onConnected?: () => void;
  onTransactionCommitted?: (data: TransactionCommittedData, envelope: LiveEventEnvelope) => void;
  onAssessmentCompleted?: (data: AssessmentCompletedData, envelope: LiveEventEnvelope) => void;
  onCaseUpdated?: (data: CaseUpdatedData, envelope: LiveEventEnvelope) => void;
  onResyncRequired?: (reason: string) => void;
}

export class LiveUpdatesClient {
  private status: ConnectionStatus = "disconnected";
  private lastEventId = 0;
  private streamId: string | null = null;
  private lastSuccessfulUpdate: string | null = null;
  private eventSource: EventSource | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  private destroyed = false;
  private notificationHistory = new Map<string, string>();

  constructor(private config: LiveUpdatesConfig) {}

  private url(path: string): string {
    const query = new URLSearchParams({ workspace_id: this.config.workspaceId ?? "default", since_id: String(this.lastEventId) });
    if (this.streamId) query.set("stream_id", this.streamId);
    return this.config.baseUrl.replace(/\/+$/, "") + path + "?" + query;
  }

  public connect(): void {
    this.destroyed = false;
    this.cleanup();
    const generation = this.generation;
    this.setStatus("reconnecting");
    if (typeof window === "undefined" || !("EventSource" in window)) {
      void this.pollLoop(generation);
      return;
    }
    try {
      const source = new EventSource(this.url("/api/events"));
      this.eventSource = source;
      const active = () => !this.destroyed && generation === this.generation;
      source.onopen = () => { if (active()) this.connected(); };
      for (const name of ["transaction_committed", "assessment_completed", "case_updated"]) {
        source.addEventListener(name, (event) => {
          if (active()) this.handleRawMessage((event as MessageEvent<string>).data);
        });
      }
      source.addEventListener("cursor", (event) => {
        if (active()) this.handleControl((event as MessageEvent<string>).data, false);
      });
      source.addEventListener("resync", (event) => {
        if (active()) this.handleControl((event as MessageEvent<string>).data, true);
      });
      source.onerror = () => {
        if (!active()) return;
        source.close();
        this.eventSource = null;
        this.setStatus("reconnecting");
        // Browsers may support EventSource while a proxy blocks SSE.
        void this.pollLoop(generation);
      };
    } catch {
      void this.pollLoop(generation);
    }
  }

  private connected(): void {
    this.lastSuccessfulUpdate = new Date().toISOString();
    const wasConnected = this.status === "connected";
    this.setStatus("connected");
    if (!wasConnected) this.config.onConnected?.();
  }

  private handleControl(raw: string, resync: boolean): void {
    try {
      const data = JSON.parse(raw) as { stream_id?: string; latest_event_id?: number; reason?: string };
      if (typeof data.latest_event_id !== "number" || !Number.isInteger(data.latest_event_id) || data.latest_event_id < 0) return;
      if (data.stream_id && data.stream_id !== this.streamId) {
        this.notificationHistory.clear();
        this.streamId = data.stream_id;
      }
      this.lastEventId = data.latest_event_id;
      if (resync) this.config.onResyncRequired?.(data.reason ?? "cursor_reset");
    } catch { /* Ignore malformed control messages; never advance their cursor. */ }
  }

  private handleRawMessage(raw: string): void {
    try {
      const event = JSON.parse(raw) as LiveEventEnvelope;
      if (!Number.isInteger(event.event_id) || event.event_id <= this.lastEventId || !event.data || typeof event.data !== "object") return;
      this.lastEventId = event.event_id;
      this.lastSuccessfulUpdate = new Date().toISOString();
      switch (event.event_type) {
        case "transaction_committed":
          this.config.onTransactionCommitted?.(event.data as unknown as TransactionCommittedData, event); break;
        case "assessment_completed":
          this.config.onAssessmentCompleted?.(event.data as unknown as AssessmentCompletedData, event); break;
        case "case_updated":
          this.config.onCaseUpdated?.(event.data as unknown as CaseUpdatedData, event); break;
        case "resync":
          this.config.onResyncRequired?.(typeof event.data.reason === "string" ? event.data.reason : "cursor_reset"); break;
      }
    } catch { /* A malformed event cannot update case state. */ }
  }

  private async pollLoop(generation: number): Promise<void> {
    if (this.destroyed || generation !== this.generation) return;
    this.abort = new AbortController();
    try {
      const response = await fetch(this.url("/api/events/poll"), { signal: this.abort.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Polling unavailable");
      const data = await response.json() as { stream_id: string; latest_event_id: number; resync_required: boolean; events: LiveEventEnvelope[] };
      if (this.destroyed || generation !== this.generation) return;
      const changedEpoch = this.streamId !== null && data.stream_id !== this.streamId;
      if (data.resync_required || changedEpoch) {
        this.handleControl(JSON.stringify({ ...data, reason: "cursor_reset" }), true);
      } else {
        for (const event of data.events) this.handleRawMessage(JSON.stringify(event));
        this.handleControl(JSON.stringify(data), false);
      }
      this.connected();
    } catch {
      if (this.destroyed || generation !== this.generation) return;
      this.setStatus("disconnected");
    }
    if (!this.destroyed && generation === this.generation) {
      this.timer = setTimeout(() => void this.pollLoop(generation), 3000);
    }
  }

  public shouldNotify(key: string, status: string): boolean {
    if (this.notificationHistory.get(key) === status) return false;
    this.notificationHistory.set(key, status);
    if (this.notificationHistory.size > 500) this.notificationHistory.delete(this.notificationHistory.keys().next().value!);
    return true;
  }
  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.config.onStatusChange?.(status);
  }
  public getStatus() { return this.status; }
  public getLastSuccessfulUpdate() { return this.lastSuccessfulUpdate; }
  public getLastEventId() { return this.lastEventId; }
  public cleanup(): void {
    this.generation++;
    this.eventSource?.close();
    this.eventSource = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
  }
  public disconnect(): void {
    this.destroyed = true;
    this.cleanup();
    this.setStatus("disconnected");
  }
}

