/** One menu holds who you are and everything you can reach. */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_NAME, TEST_ORGANIZATION_NAME, brandUrl, organizationUrl } from "../../fixtures";

test.describe("Account menu", () => {
  test("holds the organization, its brands, and its settings", async ({ page }) => {
    await page.goto(brandUrl());

    await page.getByRole("button", { name: "Account and organizations" }).click();

    // The heading above carries the same name, so the brand is matched exactly.
    await expect(page.getByRole("menuitem", { name: TEST_BRAND_NAME, exact: true })).toBeVisible({ timeout: 30_000 });
    // The heading joins the menu's roving focus, so it answers to its item role.
    await expect(
      page.getByRole("menuitem", { name: `${TEST_ORGANIZATION_NAME} organization settings` }),
    ).toHaveAttribute("href", `${organizationUrl()}/settings`);

    // The mark leads back to the list, so the menu doesn't repeat it.
    await expect(page.getByRole("menuitem", { name: /all organizations/i })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /switch brand/i })).toHaveCount(0);
  });
});
