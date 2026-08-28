/** One menu holds who you are and everything you can reach. */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_NAME, brandUrl, workspaceUrl } from "../../fixtures";

test.describe("Account menu", () => {
  test("holds the workspace, its brands, and its settings", async ({ page }) => {
    await page.goto(brandUrl());

    await page.getByRole("button", { name: "Account and workspaces" }).click();

    await expect(page.getByText(/Workspace$/).first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("menuitem", { name: TEST_BRAND_NAME })).toBeVisible();
    await expect(page.getByRole("link", { name: /workspace settings$/i })).toHaveAttribute(
      "href",
      `${workspaceUrl()}/settings`,
    );

    // The mark leads back to the list, so the menu doesn't repeat it.
    await expect(page.getByRole("menuitem", { name: /all workspaces/i })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /switch brand/i })).toHaveCount(0);
  });
});
