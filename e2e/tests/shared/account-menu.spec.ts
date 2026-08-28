/**
 * The account menu, which is also the switcher.
 *
 * One menu holds who you are and everything you can reach, so the assertions
 * here are that a workspace names itself as one, lists its brands, and offers
 * its settings from its own heading.
 */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_NAME, brandUrl, workspaceUrl } from "../../fixtures";

test.describe("Account menu", () => {
  test("holds the workspace, its brands, and its settings", async ({ page }) => {
    await page.goto(brandUrl());

    await page.getByRole("button", { name: "Account and workspaces" }).click();

    // A bare company name reads like another brand in a list of brands.
    await expect(page.getByText(/Workspace$/).first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("menuitem", { name: TEST_BRAND_NAME })).toBeVisible();
    await expect(page.getByRole("link", { name: /workspace settings$/i })).toHaveAttribute(
      "href",
      `${workspaceUrl()}/settings`,
    );

    // The switcher that used to sit above the nav is gone, and with it the row
    // that led back to a list of workspaces — the mark does that.
    await expect(page.getByRole("menuitem", { name: /all workspaces/i })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /switch brand/i })).toHaveCount(0);
  });
});
