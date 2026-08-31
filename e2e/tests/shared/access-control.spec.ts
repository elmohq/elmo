/**
 * Access-control invariants every deployment mode must hold.
 *
 * These are the guarantees that don't vary with DEPLOYMENT_MODE: an anonymous
 * visitor can't reach the dashboard, the public API needs a key, org
 * membership scopes what a signed-in user can see, and organizations can't be
 * created over HTTP in any mode. Running them under all three modes is the
 * point — a mode-specific auth or middleware change that quietly opens one of
 * these up fails here.
 */
import { expect, test } from "@playwright/test";
import { NIKE_BRAND_ID, TEST_API_KEY, TEST_BRAND_ID, brandUrl, organizationUrl } from "../../fixtures";

test.describe("Unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the dashboard redirects to login", async ({ page }) => {
    await page.goto(`${brandUrl()}`);
    await page.waitForURL(/\/auth\/login/, { timeout: 30_000 });
    expect(page.url()).toContain("returnTo");
  });

  test("the public API rejects a request with no key", async ({ request }) => {
    const response = await request.get("/api/v1/brands", { failOnStatusCode: false });
    expect(response.status()).toBe(401);
  });

  test("the public API rejects a bad key", async ({ request }) => {
    const response = await request.get("/api/v1/brands", {
      headers: { Authorization: "Bearer not-the-key" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test("the public API accepts the admin key", async ({ request }) => {
    const response = await request.get("/api/v1/brands", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(response.status()).toBe(200);
  });
});

test.describe("Authenticated access", () => {
  test("a brand in another org is not found", async ({ page }) => {
    await page.goto(`${organizationUrl()}/brand/${NIKE_BRAND_ID}`);
    await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
  });

  test("organizations cannot be created over HTTP", async ({ request }) => {
    const response = await request.post("/api/auth/organization/create", {
      data: { name: "Smuggled Org", slug: "smuggled-org" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
  });
});
