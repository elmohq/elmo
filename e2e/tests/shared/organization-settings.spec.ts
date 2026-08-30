import { test, expect } from "@playwright/test";
import { TEST_BRAND_ID, TEST_BRAND_NAME, TEST_ORG_SLUG } from "../../fixtures";

test.describe("Organization settings", () => {
  test("the organization's brands are a page of its own", async ({ page }) => {
    const response = await page.request.get(`/app/org/${TEST_ORG_SLUG}/settings/brands`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(`/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}`);

    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings/brands`);
    await expect(
      page.locator(`a[href="/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}"]`).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the organization itself is its settings, not another picker", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}`);
    await page.waitForURL(new RegExp(`/app/org/${TEST_ORG_SLUG}/settings$`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Organization", exact: true })).toBeVisible();
  });
});
