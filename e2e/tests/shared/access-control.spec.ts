/** Shared by every mode, so a mode-specific auth or middleware change that opens one of these fails here. */
import { expect, failedResource, test } from "../../test";
import { NIKE_BRAND_ID, TEST_API_KEY, TEST_BRAND_ID, brandUrl, organizationUrl } from "../../fixtures";

test.describe("Unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Asserted on the response: whitelabel's login page starts SSO as it
  // hydrates, so where a browser settles is a race.
  test("the dashboard redirects to login", async ({ request }) => {
    const response = await request.get(brandUrl(), { maxRedirects: 0, failOnStatusCode: false });
    expect(response.status()).toBe(307);

    const [pathname, query] = (response.headers().location ?? "").split("?");
    expect(pathname).toBe("/auth/login");
    expect(new URLSearchParams(query).get("returnTo")).toBe(brandUrl());
  });

  test("the login redirect keeps campaign params where analytics reads them", async ({ request }) => {
    const deepLink = `${brandUrl()}?utm_source=newsletter`;
    const response = await request.get(deepLink, { maxRedirects: 0, failOnStatusCode: false });
    expect(response.status()).toBe(307);

    const query = new URLSearchParams((response.headers().location ?? "").split("?")[1]);
    expect(query.get("utm_source")).toBe("newsletter");
    expect(query.get("returnTo")).toBe(deepLink);
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
  test("a brand in another org is not found", async ({ page, consoleErrors }) => {
    consoleErrors.allow(failedResource(404, `${organizationUrl()}/brand/${NIKE_BRAND_ID}`));
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
