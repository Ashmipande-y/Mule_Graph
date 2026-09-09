import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";

/**
 * Backend failure and recovery, from the frontend's perspective: pointing
 * live mode at an address nothing is listening on must show an honest
 * error (never a silent fallback to bundled data), and pointing it back at
 * a real backend must recover cleanly.
 */
test.describe("backend failure and recovery", () => {
  test("live mode surfaces a real error against an unreachable backend, then recovers", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Live API" }).click();

    // Point at a port nothing is listening on -- a genuine, deterministic
    // "backend is down" from the browser's point of view.
    await page.getByRole("button", { name: "Backend connection settings" }).click();
    await page.getByLabel("Backend base URL").fill("http://127.0.0.1:8812");
    await page.getByRole("button", { name: "Save & test" }).click();

    await expect(page.getByText("Failed", { exact: true })).toBeVisible();
    await expect(page.getByText(/Could not reach the backend/).first()).toBeVisible();
    await expect(page.getByText("Could not load the live graph")).toBeVisible();

    // Recovery: point back at the real, running isolated test backend.
    await page.getByLabel("Backend base URL").fill(BACKEND_URL);
    await page.getByRole("button", { name: "Save & test" }).click();

    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByText("Could not load the live graph")).not.toBeVisible();

    // Real live data now renders -- the canonical fixture's 6 accounts,
    // fetched from the backend, not the bundled simulation copy.
    await page.getByText("Accessible account list (same data as the graph)").click();
    await expect(page.getByRole("button", { name: /Inspect account Account A, ACC_A, risk HIGH/ })).toBeVisible();
  });
});
