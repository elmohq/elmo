/**
 * Workspace Settings E2E Tests
 *
 * The workspace's own page and the shell around it: the rail's way back into
 * each brand, and renaming the workspace.
 */
import { test, expect } from "@playwright/test";
import { TEST_BRAND_ID, TEST_BRAND_NAME, TEST_ORG_SLUG } from "../../fixtures";

test.describe("Workspace settings", () => {
  test("the sidebar links back to the workspace's brands", async ({ page }) => {
    // Checked against the HTML the server sends, not just the settled DOM: the
    // rail's Brands section comes from the layout loader, so the way back into
    // a brand is there before any client-side query could have supplied it.
    const response = await page.request.get(`/app/org/${TEST_ORG_SLUG}/settings`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(`/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}`);

    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);
    await expect(
      page.locator(`a[href="/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}"][data-sidebar="menu-button"]`)
    ).toBeVisible({ timeout: 30_000 });
  });

  test("a name padded with spaces can still be saved, and settles trimmed", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);

    const nameField = page.getByLabel("Name", { exact: true });
    await expect(nameField).toHaveValue(TEST_BRAND_NAME, { timeout: 30_000 });

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();

    // Padding is a change the user can make, and saving is the only way to undo
    // it — the server keeps the trimmed name either way, so this writes the name
    // it already had.
    await nameField.fill(`  ${TEST_BRAND_NAME}  `);
    await expect(save).toBeEnabled();

    await save.click();
    await expect(nameField).toHaveValue(TEST_BRAND_NAME);
    await expect(save).toBeDisabled();
  });

  test("a name of nothing but spaces cannot be saved", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);

    const nameField = page.getByLabel("Name", { exact: true });
    await expect(nameField).toHaveValue(TEST_BRAND_NAME, { timeout: 30_000 });

    await nameField.fill("   ");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  });
});
