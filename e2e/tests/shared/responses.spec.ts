import type { Page } from "@playwright/test";
import { expect, test } from "../../test";
import { brandUrl } from "../../fixtures";

const RESPONSES_URL = `${brandUrl()}/responses`;

/** The rendered answer, not the same words repeated in the raw output below it. */
function answer(page: Page, text: RegExp) {
  return page.locator("p", { hasText: text });
}

test.describe("Responses Page", () => {
  test("lists every response before anything is searched", async ({ page }) => {
    await page.goto(RESPONSES_URL);
    await expect(page.getByRole("heading", { name: "Responses", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(answer(page, /Several platforms offer AI visibility tracking/)).toBeVisible({ timeout: 30_000 });
    await expect(answer(page, /To optimize content for LLM citations/)).toBeVisible();
  });

  test("searching finds answers that use any form of the word", async ({ page }) => {
    await page.goto(RESPONSES_URL);
    await expect(answer(page, /Several platforms offer AI visibility tracking/)).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder("Search responses...").fill("optimize");

    await expect(page.getByText("2 of 8 results")).toBeVisible({ timeout: 30_000 });
    await expect(answer(page, /To optimize content for LLM citations/)).toBeVisible();
    await expect(answer(page, /Optimizing for LLM citations involves/)).toBeVisible();
    await expect(answer(page, /Several platforms offer AI visibility tracking/)).toHaveCount(0);
  });

  test("a quoted phrase matches only answers containing it", async ({ page }) => {
    await page.goto(`${RESPONSES_URL}?q=${encodeURIComponent('"Competitor Beta"')}`);

    await expect(page.getByText("2 of 8 results")).toBeVisible({ timeout: 30_000 });
    await expect(answer(page, /Competitor Alpha provides basic tracking/)).toHaveCount(0);
  });

  test("filtering to a prompt shows only its responses", async ({ page }) => {
    await page.goto(RESPONSES_URL);
    await expect(answer(page, /Several platforms offer AI visibility tracking/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Prompts" }).click();
    await page.getByPlaceholder("Search prompts...").fill("optimize");
    await page.getByRole("button", { name: "How do I optimize content for LLM citations?" }).click();

    await expect(page).toHaveURL(/prompts=00000000-0000-0000-0000-000000000003/);
    await expect(answer(page, /Several platforms offer AI visibility tracking/)).toHaveCount(0);
    await expect(answer(page, /To optimize content for LLM citations/)).toBeVisible();
    await expect(answer(page, /Optimizing for LLM citations involves/)).toBeVisible();
  });

  test("each response links to its prompt", async ({ page }) => {
    await page.goto(`${RESPONSES_URL}?q=backlinks`);
    await page.getByRole("link", { name: "How do I optimize content for LLM citations?" }).click({ timeout: 30_000 });

    await page.waitForURL(/\/prompts\/00000000-0000-0000-0000-000000000003\?tab=responses/);
  });

  test("says so when nothing matches", async ({ page }) => {
    await page.goto(`${RESPONSES_URL}?q=zebra`);
    await expect(page.getByText(/No responses contain "zebra"/)).toBeVisible({ timeout: 30_000 });
  });
});
