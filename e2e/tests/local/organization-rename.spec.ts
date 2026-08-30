import { expect, test } from "@playwright/test";
import { RENAMEABLE_BRAND_ID, RENAMEABLE_BRAND_SLUG, TEST_BRAND_NAME, TEST_ORG_SLUG, brandUrl, organizationUrl } from "../../fixtures";

test.describe("Organization rename", () => {
  test("the slug is a field of the same form, with no save of its own", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);

    const slugField = page.getByLabel("Organization Slug", { exact: true });
    await expect(slugField).toHaveValue(TEST_ORG_SLUG, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Change URL" })).toHaveCount(0);

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();

    await slugField.fill(`${TEST_ORG_SLUG}-elsewhere`);
    await expect(save).toBeEnabled();
  });

  test("a name padded with spaces can still be saved, and settles trimmed", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);

    const nameField = page.getByLabel("Organization Name", { exact: true });
    await expect(nameField).toHaveValue(TEST_BRAND_NAME, { timeout: 30_000 });

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();

    await nameField.fill(`  ${TEST_BRAND_NAME}  `);
    await expect(save).toBeEnabled();

    await save.click();
    await expect(nameField).toHaveValue(TEST_BRAND_NAME);
    await expect(save).toBeDisabled();
  });

  test("a name of nothing but spaces cannot be saved", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);

    const nameField = page.getByLabel("Organization Name", { exact: true });
    await expect(nameField).toHaveValue(TEST_BRAND_NAME, { timeout: 30_000 });

    await nameField.fill("   ");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  });
});

test.describe("Brand rename", () => {
  const moved = `${RENAMEABLE_BRAND_SLUG}-moved`;
  const settingsAt = (slug: string) => `${brandUrl(slug)}/settings/brand`;

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

    await page.waitForURL(new RegExp(`${settingsAt(moved)}$`), { timeout: 30_000 });
    await expect(page.getByLabel("Brand Slug", { exact: true })).toHaveValue(moved);

    await page.goto(brandUrl(RENAMEABLE_BRAND_ID));
    await expect(page).toHaveURL(new RegExp(`${brandUrl(moved)}$`), { timeout: 30_000 });
  });
});
