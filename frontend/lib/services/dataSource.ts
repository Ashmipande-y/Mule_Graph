import type { Transaction } from "@/types/transaction";
import demoTransactions from "@/data/demo_transactions.json";

/**
 * The bundled canonical demo scenario -- a byte-for-byte copy of
 * data/demo_transactions.json (see CLAUDE.md: that file is the repo's
 * runtime source of truth; this copy keeps the frontend self-contained
 * under frontend/ while preserving every id, amount, and timestamp exactly).
 */
export const CANONICAL_TRANSACTIONS: Transaction[] = demoTransactions as Transaction[];

/**
 * Two interchangeable ways this console can get graph data, so a real
 * FastAPI/WebSocket integration can be added later without rewriting any
 * layout:
 *
 * - "simulation": the bundled fixture, replayed client-side through the
 *   same detection logic the backend uses (lib/services/rules/*). Supports
 *   play/pause/scrub.
 * - "live": fetches the real backend's `/api/graph` as a one-shot snapshot.
 *   The backend has no replay endpoint yet, so this mode is not scrubbable
 *   -- it shows exactly what the live service currently reports, with real
 *   loading/error states and no fallback to mock data on failure.
 */
export type DataMode = "simulation" | "live";

export const DEFAULT_LIVE_BASE_URL = "http://127.0.0.1:8000";
