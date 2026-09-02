/**
 * What makes an Elmo Cloud deployment different.
 *
 * Cloud is the multi-tenant hosted product: anyone allowed by the signup
 * allowlist can register, addresses must be verified before sign-in, teammates
 * are invited by email, and the one-time report generator is switched off.
 *
 * The verification email itself is not exercised — that needs a real
 * transactional-email provider — so the specs verify addresses in the database
 * and assert on everything around it.
 */
import { expect, failedResource, test } from "../../test";
import { CLOUD_SIGNUP, TEST_BRAND_ID, TEST_USER, brandUrl, organizationUrl } from "../../fixtures";
import { deleteUsers, userExists, verifyEmail } from "../../session";
import { openAccountMenu } from "../../interactions";

const NEW_USER = {
  email: `signup@${CLOUD_SIGNUP.allowedDomain}`,
  password: "cloud-signup-password-123",
  name: "Cloud Signup",
};
const DISPOSABLE_EMAIL = `throwaway@${CLOUD_SIGNUP.disposableDomain}`;
const BLOCKED_EMAIL = `outsider@${CLOUD_SIGNUP.blockedDomain}`;

test.describe("Cloud self-serve signup", () => {
  // Serial: these tests create and delete the same accounts, so running them
  // concurrently would have one wipe another's fixture mid-test.
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    await deleteUsers([NEW_USER.email, DISPOSABLE_EMAIL, BLOCKED_EMAIL]);
  });

  test.afterAll(async () => {
    await deleteUsers([NEW_USER.email, DISPOSABLE_EMAIL, BLOCKED_EMAIL]);
  });

  test("sign in offers Google and password recovery", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /create one/i })).toBeVisible();
  });

  test("registering asks the new account to verify its email", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Name").fill(NEW_USER.name);
    await page.getByLabel("Email").fill(NEW_USER.email);
    await page.getByLabel("Password").fill(NEW_USER.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Check your email")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(NEW_USER.email)).toBeVisible();
  });

  test("an unverified account cannot sign in, and a verified one reaches plan selection", async ({ page, request }) => {
    const signUp = await request.post("/api/auth/sign-up/email", {
      data: NEW_USER,
      failOnStatusCode: false,
    });
    expect(signUp.status(), await signUp.text()).toBe(200);

    const unverified = await request.post("/api/auth/sign-in/email", {
      data: { email: NEW_USER.email, password: NEW_USER.password },
      failOnStatusCode: false,
    });
    expect(unverified.status()).toBe(403);

    await verifyEmail(NEW_USER.email);

    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(NEW_USER.email);
    await page.getByLabel("Password").fill(NEW_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/choose-plan(?:\?.*)?$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Choose your plan" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Subscribe to Starter" })).toBeVisible();
  });

  // A 400 rather than the allowlist's 403, so unlike the case below this
  // refusal does reach the caller.
  test("a disposable address is refused", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: { email: DISPOSABLE_EMAIL, password: NEW_USER.password, name: "Throwaway" },
      failOnStatusCode: false,
    });

    expect(response.ok(), `${response.status()} ${await response.text()}`).toBe(false);
    expect(await response.text()).toContain("Disposable email addresses are not supported");
    expect(await userExists(DISPOSABLE_EMAIL)).toBe(false);
  });

  /**
   * Cloud requires email verification, which puts better-auth in the mode where
   * a refused creation answers exactly as a duplicate address does — a 200 over
   * a synthetic user — so that signup cannot be used to learn who is already
   * registered. The allowlist refusal is a 403, the status that rule covers, so
   * the response says nothing either way and the account never existing is the
   * whole of what this can assert. Read it against the allowlisted signup
   * above, which does create one.
   */
  test("an address outside the allowlist creates no account", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: { email: BLOCKED_EMAIL, password: NEW_USER.password, name: "Outsider" },
      failOnStatusCode: false,
    });
    expect(response.status(), await response.text()).toBe(200);

    expect(await userExists(BLOCKED_EMAIL), "an address off the allowlist was signed up").toBe(false);
  });
});

test.describe("Cloud features", () => {
  test("report generation is switched off", async ({ page, consoleErrors }) => {
    consoleErrors.allow(failedResource(404, "/reports"));
    await page.goto("/reports");
    await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
  });

  test("the sidebar offers team settings and no reports", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);
    await expect(
      page.locator(`a[href="${organizationUrl()}/settings/members"][data-sidebar="menu-button"]`),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto(`${brandUrl()}`);
    await expect(
      page.locator(`a[href="${organizationUrl()}/settings/members"][data-sidebar="menu-button"]`),
    ).toHaveCount(0);

    // The admin section is present (this user is an admin) but has no Reports entry.
    const menu = await openAccountMenu(page);
    await expect(menu.locator('a[href="/admin"]')).toBeVisible();
    await expect(menu.locator('a[href="/reports"]')).toHaveCount(0);
  });

  test("teammates can be invited by email", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings/members`);

    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
    // The signed-in admin is listed as a member of the brand.
    await expect(page.getByRole("main").getByText(TEST_USER.email)).toBeVisible();
  });

  test("brands can be created from the UI", async ({ page }) => {
    await page.goto(`${organizationUrl()}/new`);
    await expect(page.getByLabel("Brand Name")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Website")).toBeVisible();
  });

  test("another organization can be created", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: /new organization/i })).toBeVisible({ timeout: 30_000 });

    await page.goto("/app/new");
    await expect(page.getByLabel("Organization Name")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Create organization" })).toBeVisible();
  });
});
