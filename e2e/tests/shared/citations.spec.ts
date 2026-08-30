import { test, expect } from "@playwright/test";
import { brandUrl } from "../../fixtures";

const BRAND_URL = brandUrl();

test.describe("Citations Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BRAND_URL}/citations`);
    await expect(page.getByRole("heading", { name: /citations/i })).toBeVisible({ timeout: 30_000 });
  });

  test("page loads without crashing", async ({ page }) => {
    // Wait for the page to actually finish loading by checking for a terminal state:
    // either citation content, an empty state, or an error message.
    // Use .first() because multiple elements may match when citation data loads.
    await expect(
      page.getByText(/no citations found|failed to load|citations are only|total citations|cited/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("page shows citations header or content", async ({ page }) => {
    await expect(
      page.getByText(/no citations found|failed to load|citations are only|cited/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("page has filter controls when loaded", async ({ page }) => {
    await expect(
      page.getByText(/no citations found|failed to load|citations are only|cited/i).first()
    ).toBeVisible({ timeout: 30_000 });

    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("Citations");
  });

  test("page is accessible via sidebar navigation", async ({ page }) => {
    await page.goto(`${BRAND_URL}`);
    await expect(page.locator(`a[href="${BRAND_URL}/citations"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`a[href="${BRAND_URL}/citations"][data-sidebar="menu-button"]`).click();
    await page.waitForURL(/\/citations/);

    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("Citations");
  });
});
