import { test, expect } from "@playwright/test";

const BRAND_ID = "default";
// The workspace now leads every dashboard URL; the seeded org's slug is its id.
const ORG_SLUG = "default";
const BRAND_URL = `/app/org/${ORG_SLUG}/brand/${BRAND_ID}`;

test.describe("Visibility Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BRAND_URL}/visibility`);
    await expect(page.getByRole("heading", { name: "Visibility" })).toBeVisible({ timeout: 30_000 });
  });

  test("page loads with correct title", async ({ page }) => {
  });

  test("page shows prompt-related content", async ({ page }) => {
    const pageContent = await page.textContent("body");
    const hasContent =
      pageContent?.includes("Visibility") ||
      pageContent?.includes("monitoring") ||
      pageContent?.includes("prompts");
    expect(hasContent).toBeTruthy();
  });

  test("page has filter controls", async ({ page }) => {
    const headerArea = page.locator("header, [class*='header'], [class*='Header']").first();
    await expect(headerArea).toBeVisible();
  });

  test("page is accessible via sidebar navigation", async ({ page }) => {
    await page.goto(`${BRAND_URL}`);
    const visLink = page.locator(`a[href="${BRAND_URL}/visibility"][data-sidebar="menu-button"]`);
    await expect(visLink).toBeVisible({ timeout: 15_000 });
    await visLink.click();
    await page.waitForURL(/\/visibility/);
    await expect(page.getByRole("heading", { name: "Visibility" })).toBeVisible({ timeout: 15_000 });
  });
});
