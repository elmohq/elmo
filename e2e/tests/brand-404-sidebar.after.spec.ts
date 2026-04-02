import { test, expect } from "@playwright/test";

const BRAND_ID = "default";

test("brand subpath 404 still shows sidebar (after fix)", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto(`/app/${BRAND_ID}/this-route-does-not-exist`);

	// Should render the brand layout + sidebar links, even on 404.
	await expect(page.locator(`a[href="/app/${BRAND_ID}"][data-sidebar="menu-button"]`)).toBeVisible();
	await expect(page.getByText(/404/i)).toBeVisible();

	await page.screenshot({ path: "e2e/artifacts/issue-112-after.png", fullPage: true });
});

