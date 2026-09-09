import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";

/**
 * Submitting transactions and receiving a real assessment through
 * POST /api/assess (backend/app/api/assess.py) -- if that endpoint
 * disappeared or started returning something else, the "Run risk
 * assessment" step below would fail.
 */
test.describe("transaction assessment (UI)", () => {
  test.beforeEach(async ({ page }) => {
    // POST /api/assess is submitted against the configured backend
    // regardless of graph data mode -- point it at the isolated test
    // backend, since the app's own default (127.0.0.1:8000) is
    // deliberately never assumed to be running (see playwright.config.ts).
    await page.goto("/");
    await page.getByRole("button", { name: "Backend connection settings" }).click();
    await page.getByLabel("Backend base URL").fill(BACKEND_URL);
    await page.getByRole("button", { name: "Save & test" }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Backend connection settings" }).click(); // close the popover
  });

  test("adding a transaction and running an assessment shows real rules-derived evidence", async ({ page }) => {
    await page.getByRole("button", { name: "Add transaction" }).click();

    await page.getByLabel("Transaction ID").fill("E2E_TX_ASSESS_1");
    await page.getByLabel("Sender account").fill("ACC_A");
    await page.getByLabel("Receiver account").fill("ACC_E2E_NEW");
    await page.getByLabel("Amount (INR)").fill("25000");
    await page.getByRole("button", { name: "Add to assessment" }).click();

    await expect(page.getByText("E2E_TX_ASSESS_1 added to assessment.")).toBeVisible();

    await page.getByRole("button", { name: "Run risk assessment" }).click();

    await expect(page.getByText("Risk assessment: completed")).toBeVisible();
    // The real /api/assess response includes this new account, unassessed
    // (a lone new transfer with no fan-out/convergence pattern) -- not
    // fabricated, not silently dropped. Scoped to the per-account result
    // row specifically, since the id also appears in the submission
    // preview table above.
    await expect(page.getByRole("button", { name: /ACC_E2E_NEW \(ACC_E2E_NEW\)/ })).toBeVisible();
  });

  test("invalid input is rejected client-side before ever reaching the backend", async ({ page }) => {
    await page.getByRole("button", { name: "Add transaction" }).click();
    await page.getByLabel("Transaction ID").fill("E2E_TX_BAD_AMOUNT");
    await page.getByLabel("Sender account").fill("ACC_A");
    await page.getByLabel("Receiver account").fill("ACC_E2E_BAD");
    await page.getByLabel("Amount (INR)").fill("not-a-number");
    await page.getByRole("button", { name: "Add to assessment" }).click();

    await expect(page.getByText("Amount must be a positive whole number of INR (no decimals or symbols).")).toBeVisible();
    // Rejected -- never silently added to the pending list.
    await expect(page.getByText("E2E_TX_BAD_AMOUNT added to assessment.")).not.toBeVisible();
  });
});

test.describe("transaction assessment (API-level invalid input rejection)", () => {
  test("the real backend rejects a duplicate transaction id within one assessment request", async ({ request }) => {
    const duplicateId = "E2E_TX_DUPLICATE";
    const tx = { id: duplicateId, sender: "ACC_P", receiver: "ACC_Q", amount: 1000, timestamp: "2026-01-01T00:00:00Z" };
    const response = await request.post(`${BACKEND_URL}/api/assess`, {
      data: { transactions: [tx, { ...tx, receiver: "ACC_R" }] },
    });
    expect(response.status()).toBe(409);
  });

  test("the real backend rejects a boolean amount (never silently coerced)", async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/assess`, {
      data: {
        transactions: [{ id: "E2E_TX_BOOL_AMOUNT", sender: "ACC_P", receiver: "ACC_Q", amount: true, timestamp: "2026-01-01T00:00:00Z" }],
      },
    });
    expect(response.status()).toBe(422);
  });
});
