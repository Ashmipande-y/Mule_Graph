import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Browser integration tests for the complete Next.js/FastAPI application.
 *
 * Isolation: every run starts its own fresh backend and frontend processes
 * on dedicated, non-default ports (8811 / 3011) -- never the developer's
 * own 8000/3000 dev servers. `reuseExistingServer: false` means a port
 * collision fails loudly instead of silently attaching to an unknown,
 * possibly-stale process. Backend state (the AML in-memory session store)
 * starts empty every run since the process itself is freshly spawned.
 *
 * The canonical demo dataset (`data/demo_transactions.json`) is read-only
 * from every endpoint that uses it (`GET /api/graph`, `POST /api/assess`),
 * so using the real checked-in fixture is safe and is in fact what "loading
 * and inspecting the canonical graph" needs to mean anything. The AML
 * dataset/model are optional local artifacts (see data/aml/README.md,
 * ml/aml_baseline/README.md) -- e2e/aml.spec.ts detects their absence at
 * runtime and skips itself, exactly like the Python test suites already do
 * for the same artifacts.
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");

const BACKEND_PORT = 8811;
const FRONTEND_PORT = 3011;

export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

function backendPython(): string {
  const windowsPath = path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(windowsPath)) return windowsPath;
  const posixPath = path.join(BACKEND_DIR, ".venv", "bin", "python");
  if (fs.existsSync(posixPath)) return posixPath;
  throw new Error(
    `No backend/.venv found at ${windowsPath} or ${posixPath}. Create it first: ` +
      `python -m venv backend/.venv && backend/.venv/{Scripts/python.exe,bin/python} -m pip install ` +
      `-r backend/requirements.txt -r backend/requirements-dev.txt (add -r backend/requirements-xgb.txt ` +
      `for the optional xgb-score/AML model paths).`,
  );
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        `${JSON.stringify(backendPython())} -m uvicorn app.main:app --app-dir backend ` +
        `--host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: REPO_ROOT,
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        CASE_DB_PATH: path.join(BACKEND_DIR, ".runtime", `e2e-${randomUUID()}.sqlite3`),
        // Must match FRONTEND_URL exactly -- a real browser preflights any
        // POST with a JSON body, and CORSMiddleware rejects it outright if
        // the origin isn't allow-listed (see backend/docs/integration-contract.md).
        CORS_ORIGINS: `${FRONTEND_URL},http://localhost:${FRONTEND_PORT}`,
        LOG_LEVEL: "WARNING",
      },
    },
    {
      command: `npx next dev -p ${FRONTEND_PORT}`,
      cwd: __dirname,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
