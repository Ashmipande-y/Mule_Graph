import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const AML_DATA_PRESENT = fs.existsSync(path.join(REPO_ROOT, "data", "aml", "transfers_inr.csv"));
const AML_MODEL_PRESENT = fs.existsSync(path.join(REPO_ROOT, "ml", "models", "aml_baseline.joblib"));

/**
 * AML dataset browsing and assessment -- only meaningful (and only run)
 * when the required local artifacts are present (see data/aml/README.md,
 * ml/aml_baseline/README.md). Neither is checked into git, so a fresh
 * checkout / stock CI runner skips this file entirely, same as the Python
 * test suites' own `requires_data` markers for the same artifacts.
 *
 * The AML page has no UI control for its backend base URL yet (see
 * frontend AML integration report's known limitations) -- route
 * interception redirects its API calls to the isolated test backend
 * instead, so this test still never depends on an already-running
 * personal server.
 */
test.describe("AML dataset browsing and assessment", () => {
  test.skip(!AML_DATA_PRESENT, "data/aml/transfers_inr.csv not populated -- see data/aml/README.md");
  test.skip(!AML_MODEL_PRESENT, "ml/models/aml_baseline.joblib not populated -- see ml/aml_baseline/README.md");

  test("browses the real dataset and assesses a new transaction with a real model score", async ({ page }) => {
    await page.route("http://127.0.0.1:8000/api/aml/**", async (route) => {
      // route.continue({ url }) does not reliably support changing the
      // origin/port, and route.fetch()+fulfill({response}) disposes its
      // response object under concurrent requests in this Playwright
      // version -- a plain Node fetch to the isolated test backend, with
      // its raw body/headers/status handed back, sidesteps both.
      const req = route.request();
      const url = req.url().replace("127.0.0.1:8000", new URL(BACKEND_URL).host);
      const hasBody = !["GET", "HEAD"].includes(req.method());
      try {
        const upstream = await fetch(url, {
          method: req.method(),
          // Forward only what the backend actually needs -- the original
          // request's Host/Connection/etc. headers are meaningless (and
          // sometimes rejected outright by fetch) once redirected to a
          // different port.
          headers: hasBody ? { "content-type": "application/json" } : undefined,
          body: hasBody ? (req.postData() ?? undefined) : undefined,
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        await route.fulfill({
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
          body,
        });
      } catch (error) {
        console.error("AML route interception failed:", error);
        await route.abort();
      }
    });

    await page.goto("/aml");

    // Match the full summary-card label, not just "IBM synthetic AML benchmark" --
    // that substring also appears in AmlTransactionTable's sr-only <caption>,
    // which Playwright's getByText/toBeVisible still counts as visible (a
    // non-empty, non-display:none bounding box), causing a strict-mode
    // collision between two elements.
    await expect(page.getByText("IBM synthetic AML benchmark — synthetic, not real UPI data")).toBeVisible();
    await expect(page.getByText("27,511", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add transaction" }).click();
    await page.getByLabel("Transaction ID").fill("E2E_AML_TX_1");
    await page.getByLabel("Sender account").fill("E2E_SENDER_1");
    await page.getByLabel("Receiver account").fill("E2E_RECEIVER_1");
    await page.getByLabel("Amount (INR)").fill("50000.00");
    await page.getByLabel("Date & time").fill("2022-09-05T12:00");
    await page.getByRole("button", { name: "Review" }).click();

    await expect(page.getByText("Review & assess transaction")).toBeVisible();
    await page.getByRole("button", { name: "Assess risk" }).click();

    await expect(page.getByText("Assessment result")).toBeVisible();
    // A real score is a number in [0, 1] with six decimal places rendered
    // (see AmlTransactionDrawer.tsx) -- not a placeholder/mocked value.
    await expect(page.getByText(/^0\.\d{6}$|^1\.000000$/)).toBeVisible();
    await expect(page.getByText("aml_baseline_v1")).toBeVisible();
  });
});
