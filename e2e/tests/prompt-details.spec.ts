/**
 * Prompt Details Page E2E Tests
 *
 * Tests the prompt detail page which shows individual prompt data
 * with tabs for Mentions, Web Queries, Citations, and LLM Responses.
 */
import { test, expect } from "@playwright/test";

const BRAND_ID = "default";
// This matches PROMPT_IDS.branded1 from seed.ts
const PROMPT_ID = "00000000-0000-0000-0000-000000000001";
const PROMPT_TEXT = "What is the best AI monitoring tool";

test.describe("Prompt Details Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}/prompts/${PROMPT_ID}`);
    // Wait for the prompt text to appear (route loader + client data fetch)
    await expect(page.getByText(PROMPT_TEXT)).toBeVisible({ timeout: 30_000 });
  });

  test("can switch between tabs", async ({ page }) => {
    await expect(page.getByText(PROMPT_TEXT)).toBeVisible();

    // Click on "LLM Responses" tab
    const responsesTab = page.getByRole("tab", { name: /LLM Responses/i }).or(
      page.getByRole("button", { name: /LLM Responses/i })
    ).or(
      page.getByText("LLM Responses", { exact: true })
    );
    await responsesTab.first().click();

    // The selected tab should load its seeded run data, not merely change its visual state.
    await expect(page.getByText("gpt-4o").first()).toBeVisible();
  });
});
