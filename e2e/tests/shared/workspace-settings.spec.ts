/**
 * Workspace Settings E2E Tests
 *
 * The workspace's own page and the shell around it: the rail's way back into
 * each brand, and renaming the workspace.
 */
import { test, expect } from "@playwright/test";
import { TEST_BRAND_ID, TEST_BRAND_NAME, TEST_ORG_SLUG } from "../../fixtures";

test.describe("Workspace settings", () => {
  test("the workspace's brands are a page of its own", async ({ page }) => {
    // Checked against the HTML the server sends, not just the settled DOM: the
    // list comes from the layout the route already resolved, so the way back
    // into a brand is there before any client-side query could have supplied it.
    const response = await page.request.get(`/app/org/${TEST_ORG_SLUG}/settings/brands`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(`/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}`);

    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings/brands`);
    await expect(
      page.locator(`a[href="/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}"]`).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the workspace itself is its settings, not another picker", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}`);
    await page.waitForURL(new RegExp(`/app/org/${TEST_ORG_SLUG}/settings$`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  });
});
