import { organizationUrl } from "../../fixtures";
import { expect, test } from "../../test";

const settingsPage = () => `${organizationUrl()}/settings`;
const loginPage = () => `/auth/login?${new URLSearchParams({ returnTo: settingsPage() })}`;

test("opening sign-in while signed in goes straight to the page asked for", async ({ page }) => {
  await page.goto(loginPage());

  await expect(page).toHaveURL(settingsPage(), { timeout: 30_000 });
});

test("a tab left on the sign-in form moves on once another tab has signed in", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === "demo" || testInfo.project.name === "whitelabel", "there is no form to wait on");

  const session = await context.cookies();
  await context.clearCookies();
  await page.goto(loginPage());
  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });

  await context.addCookies(session);

  // Retried because the page may not be listening yet when the form first shows.
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(settingsPage(), { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
});
