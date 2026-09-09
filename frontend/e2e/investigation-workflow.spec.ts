import { expect, test, type Page } from "@playwright/test";
import { BACKEND_URL, FRONTEND_URL } from "../playwright.config";

async function configure(page: Page) {
  await page.getByRole("button", { name: "Backend connection settings" }).click();
  await page.getByLabel("Backend base URL").fill(BACKEND_URL);
  await page.getByRole("button", { name: "Save & test" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Backend connection settings" }).click();
}

test("assessment evidence becomes a saved case; another browser sees decisions and notes live", async ({ page, browser }) => {
  await page.goto("/");
  await configure(page);
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  // Leaving the entry form reveals the assessment controls.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Load example network" }).click();
  await page.getByRole("button", { name: "Run risk assessment" }).click();
  await expect(page.getByText("Risk assessment: completed")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Investigator/ }).click();
  await expect(page.getByLabel("Investigation source")).toContainText("Current dataset (assessment)");
  await expect(page.getByText("Evidence score 0.9317", { exact: false })).toBeVisible();

  const createdResponse = page.waitForResponse((r) => r.url() === BACKEND_URL + "/api/cases" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Open case", exact: true }).click();
  const record = await (await createdResponse).json();
  expect(record.finding.fan_out_transaction_ids).toEqual(["TX_002", "TX_003", "TX_004"]);
  await expect(page.getByTestId("case-status")).toHaveText(record.status);

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  try {
    await second.goto(FRONTEND_URL + "/investigator");
    await configure(second);
    await expect(second.getByLabel("Investigation source")).toContainText(record.case_id);
    await second.getByLabel("Investigation source").selectOption(record.case_id);
    await expect(second.getByText("LIVE UPDATES", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Start investigation|Reopen investigation/ }).click();
    await expect(second.getByTestId("case-status")).toHaveText("investigating");
    const note = "Browser workflow verified " + Date.now();
    await page.getByLabel("Case note").fill(note);
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await second.getByText(/Saved notes and history/).click();
    await expect(second.getByText(note, { exact: true })).toBeVisible();

    await second.reload();
    await configure(second);
    await expect(second.getByLabel("Investigation source")).toContainText(record.case_id);
    await second.getByLabel("Investigation source").selectOption(record.case_id);
    await expect(second.getByTestId("case-status")).toHaveText("investigating");
    await second.getByText(/Saved notes and history/).click();
    await expect(second.getByText(note, { exact: true })).toBeVisible();
  } finally { await secondContext.close(); }
});

test("investigator follows replay instead of silently restoring the full demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset replay to start" }).click();
  await page.getByRole("link", { name: /Investigator/ }).click();
  await expect(page.getByText("No case detected in the current dataset.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open case", exact: true })).toHaveCount(0);
});

test("SSE failure falls back to polling and refreshes saved cases", async ({ page, request }) => {
  await page.route("**/api/events?*", (route) => route.abort());
  await page.goto("/investigator");
  await configure(page);
  await expect(page.getByText("LIVE UPDATES", { exact: true })).toBeVisible();
  const graph = await (await request.get(BACKEND_URL + "/api/graph")).json();
  const transactions = graph.edges.map((e: { id: string; source: string; target: string; amount: number; timestamp: string }) => ({
    id: "POLL_" + e.id, sender: "POLL_" + e.source, receiver: "POLL_" + e.target, amount: e.amount, timestamp: e.timestamp,
  }));
  const created = await request.post(BACKEND_URL + "/api/cases", { data: {
    transactions, source_account: "POLL_ACC_A", collector_account: "POLL_ACC_X",
    intermediary_accounts: ["POLL_ACC_B", "POLL_ACC_C", "POLL_ACC_D"],
  } });
  expect(created.ok()).toBe(true);
  const record = await created.json();
  await expect(page.getByLabel("Investigation source")).toContainText(record.case_id, { timeout: 10000 });
  await page.getByLabel("Investigation source").selectOption(record.case_id);
  await expect(page.getByTestId("case-status")).toHaveText("new");
});

