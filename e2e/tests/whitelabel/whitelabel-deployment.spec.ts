/**
 * What makes a whitelabel deployment different.
 *
 * A whitelabel instance is embedded in a partner's product: it wears their
 * branding, sends every sign-in to their Auth0 tenant, takes its organizations
 * from Auth0 rather than letting users create brands, and adds an "Optimize
 * with <parent>" hand-off from each prompt chart back to the parent app.
 *
 * The identity provider is a non-resolvable placeholder domain, so these specs
 * assert that the app hands off to it correctly rather than completing a real
 * SSO round trip (the authenticated session is minted directly — see
 * e2e/session.ts).
 */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_ID, WHITELABEL } from "../../fixtures";

const isIdpRequest = (url: URL) => url.host === WHITELABEL.auth0Domain;

test.describe("Whitelabel sign-in is SSO only", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login page renders no password form", async ({ request }) => {
    const html = await (await request.get("/auth/login")).text();
    expect(html).toContain("Redirecting to your identity provider");
    expect(html).not.toContain('type="password"');
  });

  test("the login page hands off to the identity provider", async ({ page }) => {
    // Stub the IdP so the browser doesn't chase a domain that never resolves;
    // the assertion is on the authorize URL the app builds.
    const authorizeRequests: string[] = [];
    await page.route(isIdpRequest, async (route) => {
      authorizeRequests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html>idp stub</html>" });
    });

    await page.goto("/auth/login");
    await expect.poll(() => authorizeRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);

    const authorizeUrl = new URL(authorizeRequests[0]);
    expect(authorizeUrl.pathname).toBe("/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(WHITELABEL.auth0ClientId);
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toContain("/api/auth/sso/callback/auth0-whitelabel");
  });

  test("password sign-in is refused", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: "someone@partner.test", password: "whatever-password-123" },
      failOnStatusCode: false,
    });
    expect(response.ok()).toBe(false);
  });

  test("signup is refused", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: { email: "someone@partner.test", password: "whatever-password-123", name: "Someone" },
      failOnStatusCode: false,
    });
    expect(response.ok()).toBe(false);
  });

  test("signing out clears the Auth0 session too", async ({ request }) => {
    const response = await request.get("/auth/logout", { maxRedirects: 0, failOnStatusCode: false });
    expect(response.status()).toBe(302);

    const location = new URL(response.headers().location);
    expect(location.host).toBe(WHITELABEL.auth0Domain);
    expect(location.pathname).toBe("/v2/logout");
    expect(location.searchParams.get("client_id")).toBe(WHITELABEL.auth0ClientId);
  });
});

test.describe("Whitelabel branding", () => {
  test("the partner name and icon replace the Elmo wordmark", async ({ page }) => {
    await page.goto(`/app/${TEST_BRAND_ID}`);

    await expect(page.getByText(WHITELABEL.appName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`img[alt="${WHITELABEL.appName} logo"]`).first()).toHaveAttribute(
      "src",
      WHITELABEL.appIcon,
    );
    await expect(page.getByText("elmo", { exact: true })).toHaveCount(0);
  });

  test("Elmo's version and project links are hidden", async ({ page }) => {
    await page.goto(`/app/${TEST_BRAND_ID}`);
    await expect(page.locator(`a[href="/app/${TEST_BRAND_ID}"][data-sidebar="menu-button"]`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('a[href="https://github.com/elmohq/elmo"]')).toHaveCount(0);
    await expect(page.locator('a[href="https://www.elmohq.com/"]')).toHaveCount(0);
  });

  test("the web manifest carries the partner icon", async ({ request }) => {
    const response = await request.get("/api/manifest");
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as { short_name: string; icons: { src: string }[] };
    expect(manifest.short_name).toBe(WHITELABEL.appName);
    expect(manifest.icons).toEqual([{ src: WHITELABEL.appIcon, sizes: "128x128", type: "image/png" }]);
  });
});

test.describe("Whitelabel features", () => {
  test("brands come from Auth0, so the UI offers no way to create one", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Brand Switcher" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /create new brand/i })).toHaveCount(0);

    await page.goto("/app/new");
    await page.waitForURL(/\/app(?:\/)?$/, { timeout: 30_000 });
  });

  test("prompt charts offer the optimize hand-off to the parent app", async ({ page, context }) => {
    await page.goto(`/app/${TEST_BRAND_ID}/visibility`);

    const optimize = page.getByRole("button", { name: `Optimize with ${WHITELABEL.parentName}` }).first();
    await expect(optimize).toBeVisible({ timeout: 30_000 });

    // "All models" renders a per-model menu; each entry opens the parent app.
    await optimize.click();
    const popupPromise = context.waitForEvent("page");
    await page.getByRole("menuitem").first().click();

    const popup = await popupPromise;
    const optimizeUrl = new URL(popup.url());
    expect(optimizeUrl.origin).toBe(WHITELABEL.optimizationUrlOrigin);
    expect(optimizeUrl.searchParams.get("org_id")).toBe(TEST_BRAND_ID);
    expect(optimizeUrl.searchParams.get("prompt")).toBeTruthy();
    await popup.close();
  });

  test("report generation is available", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: /reports/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("team settings are unavailable", async ({ page }) => {
    await page.goto(`/app/${TEST_BRAND_ID}/settings/members`);
    await page.waitForURL(new RegExp(`/app/${TEST_BRAND_ID}$`), { timeout: 30_000 });
  });
});
