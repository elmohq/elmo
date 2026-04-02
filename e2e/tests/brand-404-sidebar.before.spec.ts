import { test, expect } from "@playwright/test";

const BRAND_ID = "default";

test("brand subpath 404 (before screenshot)", async ({ page }) => {
	// Auth is handled by Playwright global setup (e2e/auth-setup.ts),
	// which writes a storage state used by all tests.
	await page.goto(`/app/${BRAND_ID}/this-route-does-not-exist`);

	// Give SSR a moment to settle
	await page.waitForTimeout(1000);

	// Assert we got a 404 page of some kind (text differs based on implementation)
	await expect(page.getByText(/not found|404/i)).toBeVisible();

	await page.setViewportSize({ width: 1280, height: 720 });
	await page.screenshot({ path: "e2e/artifacts/issue-112-before.png", fullPage: true });
});

