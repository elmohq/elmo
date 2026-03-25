/**
 * API Documentation Page E2E Tests
 *
 * Tests that the Scalar API reference page is accessible
 * and renders correctly.
 */
import { test, expect } from "@playwright/test";

test.describe("API Documentation", () => {
  test("GET /api/v1/docs returns API docs page", async ({ page }) => {
    const response = await page.goto("/api/v1/docs");

    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
  });

  test("API docs page has correct structure", async ({ page }) => {
    await page.goto("/api/v1/docs");

    const apiReference = page.locator("#api-reference");
    await expect(apiReference).toBeVisible();
  });

  test("API docs load the API spec", async ({ page }) => {
    await page.goto("/api/v1/docs");

    const apiReference = page.locator("#api-reference");
    await expect(apiReference).not.toBeEmpty();
  });
});
