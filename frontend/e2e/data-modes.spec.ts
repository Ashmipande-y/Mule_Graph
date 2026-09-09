import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";

/**
 * Switching among simulation, live, and assessment must never mix their
 * transactions, counts, or evidence -- the historical bug this guards
 * against: live mode showed a real backend graph next to the *bundled*
 * bundled demo's transaction list, with alerts/cases hardcoded empty
 * regardless of what the backend actually reported (hooks/useConsoleData.ts).
 */
test.describe("data mode switching", () => {
  test("live mode shows real transactions and alerts from the backend, not bundled/empty data", async ({ page }) => {
    await page.goto("/");

    // Simulation mode: the one real finding is visible, as established in
    // canonical-graph.spec.ts.
    await page.getByRole("tab", { name: /Alerts/ }).click();
    await expect(page.getByText("Fan-out / convergence pattern detected")).toBeVisible();

    // Switch to live mode, pointed at the isolated test backend (same
    // canonical fixture, served over HTTP instead of bundled client-side).
    await page.getByRole("button", { name: "Live API" }).click();
    await page.getByRole("button", { name: "Backend connection settings" }).click();
    await page.getByLabel("Backend base URL").fill(BACKEND_URL);
    await page.getByRole("button", { name: "Save & test" }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Backend connection settings" }).click(); // close the popover

    // The transaction stream must show the LIVE graph's real edges (TX_001..TX_007),
    // not the bundled simulation copy under a different guise, and not be empty.
    await page.getByRole("tab", { name: "Event stream" }).click();
    for (const id of ["TX_001", "TX_002", "TX_003", "TX_004", "TX_005", "TX_006", "TX_007"]) {
      await expect(page.getByText(id, { exact: true })).toBeVisible();
    }

    // Alerts must be real, derived from the backend's actual findings --
    // previously hardcoded to empty in live mode regardless of evidence.
    await page.getByRole("tab", { name: /Alerts/ }).click();
    await expect(page.getByText("Fan-out / convergence pattern detected")).toBeVisible();
    await expect(page.getByText(/Evidence score 0\.9317/)).toBeVisible();

    // Switching back to simulation must show simulation's own state again,
    // uncorrupted by the live excursion.
    await page.getByRole("button", { name: "Simulation" }).click();
    await expect(page.getByText("Fan-out / convergence pattern detected")).toBeVisible();
  });
});
