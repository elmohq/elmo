/**
 * App routing E2E tests
 *
 * The URL shape itself: `/app/org/$org/brand/$brand`, what resolves in each
 * segment, what canonicalizes, and what a link minted before this shape gets
 * instead of a dead end.
 */
import { expect, test } from "@playwright/test";
import {
	NIKE_BRAND_ID,
	SLUGGED_BRAND_ID,
	SLUGGED_BRAND_SLUG,
	TEST_BRAND_ID,
	TEST_BRAND_NAME,
	TEST_ORG_SLUG,
	workspaceUrl,
} from "../../fixtures";

/** The seeded brand has no slug, so its segment is its id — the pre-slug state. */
const BRAND_URL = `/app/org/${TEST_ORG_SLUG}/brand/${TEST_BRAND_ID}`;
const SLUGGED_BRAND_URL = `/app/org/${TEST_ORG_SLUG}/brand/${SLUGGED_BRAND_SLUG}`;

test.describe("App routing", () => {
	test("a brand with no slug resolves by id", async ({ page }) => {
		await page.goto(BRAND_URL);
		await expect(page).toHaveURL(new RegExp(`${BRAND_URL}$`), { timeout: 30_000 });
		await expect(page.locator(`a[href="${BRAND_URL}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 30_000 });
	});

	test("a brand with a slug resolves by it, and its id canonicalizes to it", async ({ page }) => {
		await page.goto(SLUGGED_BRAND_URL);
		await expect(page).toHaveURL(new RegExp(`${SLUGGED_BRAND_URL}$`), { timeout: 30_000 });

		// Two live URLs for one page is exactly what naming things was meant to
		// end, so the id is a way in but not a place to stay.
		await page.goto(`/app/org/${TEST_ORG_SLUG}/brand/${SLUGGED_BRAND_ID}/citations`);
		await expect(page).toHaveURL(new RegExp(`${SLUGGED_BRAND_URL}/citations$`), { timeout: 30_000 });
	});

	// Nothing a workspace or brand is named can shadow a sibling route now that
	// both sit under a static segment, so these are ordinary pages rather than
	// names the app has to reserve.
	test("route names are reachable as workspace pages", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);
		await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible({ timeout: 30_000 });

		// Reachable as a page wherever brands can be created, and redirected back
		// to the workspace where they can't — either way it resolves as a route
		// rather than being read as a workspace named "new".
		await page.goto(`/app/org/${TEST_ORG_SLUG}/new`);
		await expect(page).toHaveURL(new RegExp(`/app/org/${TEST_ORG_SLUG}(?:/new|/settings)?/?$`), {
			timeout: 30_000,
		});
	});

	// The 404 answers "somewhere else" with the same directory /app renders, so a
	// stale link — a bookmark from before the workspace was in the URL, or a page
	// that never existed — still leads somewhere.
	test("an unknown page offers everything the user can reach", async ({ page }) => {
		await page.goto("/app/org/not-a-workspace");

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("link", { name: TEST_BRAND_NAME, exact: true }).first()).toBeVisible();
	});

	test("a pre-workspace link lands on the same directory", async ({ page }) => {
		await page.goto(`/app/${TEST_BRAND_ID}/citations`);

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(`a[href="${BRAND_URL}"]`).first()).toBeVisible();
	});

	// Membership in the workspace is what grants access, and the brand is looked
	// up inside it — so another tenant's brand is absent here, not forbidden.
	test("a brand from another workspace does not resolve under this one", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/brand/${NIKE_BRAND_ID}`);
		await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
	});

	test("the workspace settings page states the workspace's URL slug", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);
		await expect(page.getByLabel("URL slug", { exact: true })).toHaveValue(TEST_ORG_SLUG, { timeout: 30_000 });
	});

	// The trail is read off the routes that matched, so it says where the page
	// sits without a second parser guessing at the pathname.
	test("the breadcrumb trail names the workspace, the brand, and the page", async ({ page }) => {
		await page.goto(`${BRAND_URL}/citations`);

		const trail = page.getByRole("navigation", { name: "breadcrumb" });
		await expect(trail.getByText(TEST_BRAND_NAME, { exact: true })).toBeVisible({ timeout: 30_000 });
		await expect(trail.getByText("Citations", { exact: true })).toBeVisible();

		// Named as a workspace, so the first crumb doesn't read as another brand.
		await expect(trail.getByText(/Workspace$/)).toBeVisible();
		// The workspace crumb leads back to the workspace, not to the brand.
		await expect(trail.locator(`a[href="${workspaceUrl()}"]`)).toBeVisible();
	});

	test("a workspace page's trail leads with the workspace", async ({ page }) => {
		await page.goto(`${workspaceUrl()}/settings/brands`);

		const trail = page.getByRole("navigation", { name: "breadcrumb" });
		await expect(trail.locator(`a[href="${workspaceUrl()}"]`)).toBeVisible({ timeout: 30_000 });
		await expect(trail.getByText("Settings", { exact: true })).toBeVisible();
		await expect(trail.getByText("Brands", { exact: true })).toBeVisible();
	});
});
