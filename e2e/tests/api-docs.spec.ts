/**
 * API Documentation Page E2E Tests
 *
 * Tests that the Swagger UI documentation page is accessible
 * and renders correctly.
 */
import { test, expect } from "@playwright/test";

test.describe("API Documentation", () => {
  test("GET /api/v1/docs returns Swagger UI page", async ({ page }) => {
    const response = await page.goto("/api/v1/docs");

    // Should return 200 with HTML content
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
  });

  test("Swagger UI page has correct structure", async ({ page }) => {
    await page.goto("/api/v1/docs");

    // Should have the page title
    await expect(page.getByText("API Documentation")).toBeVisible();
    await expect(page.getByText("REST API for administrative operations")).toBeVisible();

    // Should have the swagger-ui container
    const swaggerContainer = page.locator("#swagger-ui");
    await expect(swaggerContainer).toBeVisible();
  });

  test("Swagger UI loads the API spec", async ({ page }) => {
    await page.goto("/api/v1/docs");

    // Wait for Swagger UI to render content (it fetches /api/v1/openapi.json)
    const swaggerContent = page.locator("#swagger-ui");
    await expect(swaggerContent).not.toBeEmpty();
  });
});
