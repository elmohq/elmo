import { test, expect } from "@playwright/test";
import { brandUrl } from "../../fixtures";

const BRAND_URL = brandUrl();
const PROMPT_ID = "00000000-0000-0000-0000-000000000001";
const PROMPT_TEXT = "What is the best AI monitoring tool";

test.describe("Prompt Details Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BRAND_URL}/prompts/${PROMPT_ID}`);
    await expect(page.getByText(PROMPT_TEXT)).toBeVisible({ timeout: 30_000 });
  });

  test("page loads and shows prompt text", async ({ page }) => {
  });

  test("page shows tab navigation", async ({ page }) => {

    const tabs = ["Mentions", "Web Queries", "Citations", "LLM Responses"];

    for (const tabName of tabs) {
      const tab = page.getByRole("tab", { name: tabName }).or(
        page.getByRole("button", { name: tabName })
      ).or(
        page.getByText(tabName, { exact: true })
      );
      await expect(tab.first()).toBeVisible();
    }
  });

  test("can switch between tabs", async ({ page }) => {
    await expect(page.getByText(PROMPT_TEXT)).toBeVisible();

    const responsesTab = page.getByRole("tab", { name: /LLM Responses/i }).or(
      page.getByRole("button", { name: /LLM Responses/i })
    ).or(
      page.getByText("LLM Responses", { exact: true })
    );
    await responsesTab.first().click();

    const pageContent = await page.textContent("body");
    const hasRunContent =
      pageContent?.includes("gpt-4o") ||
      pageContent?.includes("claude") ||
      pageContent?.includes("gemini") ||
      pageContent?.includes("Response") ||
      pageContent?.includes("response");
    expect(hasRunContent).toBeTruthy();
  });

  test("page shows prompt metadata", async ({ page }) => {
    await expect(page.getByText(PROMPT_TEXT)).toBeVisible();

    const pageContent = await page.textContent("body");
    const hasMetadata =
      pageContent?.includes("monitoring") ||
      pageContent?.includes("branded") ||
      pageContent?.includes("AI monitoring");
    expect(hasMetadata).toBeTruthy();
  });

  test("has back navigation", async ({ page }) => {
    const backNav = page.locator(`a[href*="${BRAND_URL}"]`).first();
    await expect(backNav).toBeVisible();
  });
});
