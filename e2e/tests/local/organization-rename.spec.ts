/**
 * Not in `shared/`: where the record isn't the deployment's, the save is
 * refused and each mode has its own spec for that. This is the behaviour where
 * the name is ours to change.
 */
import { expect, test } from "@playwright/test";
import {
  RENAMEABLE_BRAND_ID,
  RENAMEABLE_BRAND_SLUG,
  TEST_BRAND_NAME,
  TEST_ORG_SLUG,
} from "../../fixtures";

test.describe("Organization rename", () => {
  // Doesn't commit a new slug: the suite shares one seeded organization, and
  // moving it without restoring would strand every other spec.
  test("the slug is a field of the same form, with no save of its own", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);

    const slugField = page.getByLabel("Organization Slug", { exact: true });
    await expect(slugField).toHaveValue(TEST_ORG_SLUG, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Change URL" })).toHaveCount(0);

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();

    await slugField.fill(`${TEST_ORG_SLUG}-elsewhere`);
    await expect(save).toBeEnabled();
  });

  test("a name padded with spaces can still be saved, and settles trimmed", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);

    const nameField = page.getByLabel("Organization Name", { exact: true });
    await expect(nameField).toHaveValue(TEST_BRAND_NAME, { timeout: 30_000 });

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();

    // The server trims either way, so this writes the name it already had.
    await nameField.fill(`  ${TEST_BRAND_NAME}  `);
    await expect(save).toBeEnabled();

    await save.click();
    await expect(nameField).toHaveValue(TEST_BRAND_NAME);
    await expect(save).toBeDisabled();
  });

  test("a name of nothing but spaces cannot be saved", async ({ page }) => {
    await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);

    const nameField = page.getByLabel("Organization Name", { exact: true });
    await expect(nameField).toHaveValue(TEST_BRAND_NAME, { timeout: 30_000 });

    await nameField.fill("   ");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  });
});

test.describe("Brand rename", () => {
  const moved = `${RENAMEABLE_BRAND_SLUG}-moved`;
  const settingsAt = (slug: string) => `/app/org/${TEST_ORG_SLUG}/brand/${slug}/settings/brand`;

  // CI retries once, so a failure part-way through would leave the brand at the
  // moved slug and guarantee the retry fails too.
  test.afterEach(async ({ page }) => {
    await page.goto(settingsAt(moved));
    const field = page.getByLabel("Brand Slug", { exact: true });
    if (!(await field.isVisible().catch(() => false))) return;
    await field.fill(RENAMEABLE_BRAND_SLUG);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL(new RegExp(`${settingsAt(RENAMEABLE_BRAND_SLUG)}$`), { timeout: 30_000 });
  });

  test("moving a brand's slug moves the page, and the new address resolves", async ({ page }) => {
    await page.goto(settingsAt(RENAMEABLE_BRAND_SLUG));

    const slugField = page.getByLabel("Brand Slug", { exact: true });
    await expect(slugField).toHaveValue(RENAMEABLE_BRAND_SLUG, { timeout: 30_000 });

    await slugField.fill(moved);
    await page.getByRole("button", { name: "Save Changes" }).click();

    // The address the form is on is the one that just moved.
    await page.waitForURL(new RegExp(`${settingsAt(moved)}$`), { timeout: 30_000 });
    await expect(page.getByLabel("Brand Slug", { exact: true })).toHaveValue(moved);

    // The id still reaches it, and canonicalizes to where it now lives.
    await page.goto(`/app/org/${TEST_ORG_SLUG}/brand/${RENAMEABLE_BRAND_ID}`);
    await expect(page).toHaveURL(new RegExp(`/app/org/${TEST_ORG_SLUG}/brand/${moved}$`), { timeout: 30_000 });
  });
});
