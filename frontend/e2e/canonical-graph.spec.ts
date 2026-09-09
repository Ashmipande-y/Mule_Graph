import { expect, test } from "@playwright/test";

/**
 * Loading and inspecting the canonical graph (simulation mode, the app's
 * default landing state). Exercises the real client-side rules replay
 * against the bundled canonical fixture -- no backend involved.
 */
test.describe("canonical graph", () => {
  test("loads the canonical demo network and shows real fan-out/convergence evidence", async ({ page }) => {
    await page.goto("/");

    // Simulation starts fully revealed (revealedCount defaults to the whole
    // fixture) -- the graph should already show all 6 accounts.
    await page.getByText("Accessible account list (same data as the graph)").click();

    const accountRow = page.getByRole("button", { name: /Inspect account Account A, ACC_A, risk HIGH/ });
    await expect(accountRow).toBeVisible();
    await expect(page.getByRole("button", { name: /Inspect account Victim, ACC_VICTIM, risk UNASSESSED/ })).toBeVisible();

    await accountRow.click();

    // The account inspector panel now shows this account's real evidence
    // (the same 0.9317 score already visible in the accessible list row above).
    await expect(page.getByText("Evidence score", { exact: true })).toBeVisible();

    // The one real fan-out/convergence alert, from the actual detector --
    // not fabricated, not just a risk-score rollup.
    await page.getByRole("tab", { name: /Alerts/ }).click();
    await expect(page.getByText("Fan-out / convergence pattern detected")).toBeVisible();
    await expect(page.getByText(/Evidence score 0\.9317/)).toBeVisible();
  });
});
