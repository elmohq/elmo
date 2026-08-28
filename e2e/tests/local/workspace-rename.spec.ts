/**
 * Renaming a workspace, which only some deployments allow.
 *
 * Not in `shared/`: a whitelabel workspace is Auth0's record and demo writes
 * nothing, so both show these fields read-only. This is the behaviour where the
 * name is ours to change.
 */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_NAME, TEST_ORG_SLUG } from "../../fixtures";

test.describe("Workspace rename", () => {
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
