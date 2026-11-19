import { expect, test } from "../../test";
import { organizationUrl } from "../../fixtures";

test("a tab whose session has ended is sent to sign in again and returns where it was", async ({
  page,
  context,
  consoleErrors,
}, testInfo) => {
  test.skip(testInfo.project.name === "whitelabel", "signing in again leaves for the identity provider");
  // The request that finds the session gone still fails, and whether that is
  // logged before the browser leaves for sign-in depends on timing.
  consoleErrors.allow("AuthenticationRequiredError");

  await page.goto(`${organizationUrl()}/settings`, { waitUntil: "networkidle" });
  await context.clearCookies();
  await page.getByRole("link", { name: "API Keys" }).click();

  const keysPage = `${organizationUrl()}/settings/api-keys`;
  if (testInfo.project.name === "demo") {
    // The demo signs every visitor in on its own.
    await expect(page).toHaveURL(keysPage, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();
  } else {
    await expect(page).toHaveURL(`/auth/login?${new URLSearchParams({ returnTo: keysPage })}`);
    await expect(page.locator("#email")).toBeVisible();
  }
});
