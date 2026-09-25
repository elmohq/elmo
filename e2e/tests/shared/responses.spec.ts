import { expect, test } from "../../test";
import { brandUrl } from "../../fixtures";

const RESPONSES_URL = `${brandUrl()}/responses`;

function matchingResponses(page: import("@playwright/test").Page) {
  return page.getByRole("button").filter({ has: page.locator("mark") });
}

test.describe("Responses Page", () => {
  test("lists every response before anything is searched", async ({ page }) => {
    await page.goto(RESPONSES_URL);
    await expect(page.getByRole("heading", { name: "Responses", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Latest Responses")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Several platforms offer AI visibility tracking/)).toBeVisible();
  });

  test("searching finds answers that use any form of the word", async ({ page }) => {
    await page.goto(RESPONSES_URL);
    await expect(page.getByText("Latest Responses")).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder("Search responses...").fill("optimize");

    await expect(page.getByText("25% of 8 responses")).toBeVisible({ timeout: 30_000 });
    await expect(matchingResponses(page)).toHaveCount(2);
    await expect(page.locator("mark", { hasText: /^Optimizing$/ })).toBeVisible();
    await expect(page.locator("mark", { hasText: /^optimize$/ })).toBeVisible();
  });

  test("a quoted phrase matches only answers containing it", async ({ page }) => {
    await page.goto(`${RESPONSES_URL}?q=${encodeURIComponent('"Competitor Beta"')}`);

    await expect(page.getByText("25% of 8 responses")).toBeVisible({ timeout: 30_000 });
    await expect(matchingResponses(page)).toHaveCount(2);
    await expect(page.getByText("Competitors Mentioned")).toBeVisible();
  });

  test("opening a match shows the full answer", async ({ page }) => {
    await page.goto(`${RESPONSES_URL}?q=backlinks`);
    await matchingResponses(page).first().click({ timeout: 30_000 });

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByText(/consistent brand messaging across your digital presence/),
    ).toBeVisible();
    await expect(sheet.getByRole("link", { name: /All responses to this prompt/ })).toBeVisible();
  });

  test("says so when nothing matches", async ({ page }) => {
    await page.goto(`${RESPONSES_URL}?q=zebra`);
    await expect(page.getByText(/No responses contain "zebra"/)).toBeVisible({ timeout: 30_000 });
  });
});
