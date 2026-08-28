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
	organizationUrl,
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

	// Nothing an organization or brand is named can shadow a sibling route now that
	// both sit under a static segment, so these are ordinary pages rather than
	// names the app has to reserve.
	test("route names are reachable as organization pages", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);
		await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible({ timeout: 30_000 });

		// Reachable as a page wherever brands can be created, and redirected back
		// to the organization where they can't — either way it resolves as a route
		// rather than being read as an organization named "new".
		await page.goto(`/app/org/${TEST_ORG_SLUG}/new`);
		await expect(page).toHaveURL(new RegExp(`/app/org/${TEST_ORG_SLUG}(?:/new|/settings)?/?$`), {
			timeout: 30_000,
		});
	});

	// A stale bookmark and a page that never existed get the same answer.
	test("an unknown page offers everything the user can reach", async ({ page }) => {
		await page.goto("/app/org/not-a-organization");

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("link", { name: TEST_BRAND_NAME, exact: true }).first()).toBeVisible();
	});

	// A full-page view has no rail, and a mark that goes nowhere reads as broken.
	test("the mark on a full-page view leads to the directory", async ({ page }) => {
		await page.goto("/app/org/not-a-organization");

		const mark = page.getByRole("link", { name: "Go to your organizations" });
		await expect(mark).toBeVisible({ timeout: 30_000 });
		await expect(mark).toHaveAttribute("href", "/app");
	});

	test("a pre-organization link lands on the same directory", async ({ page }) => {
		await page.goto(`/app/${TEST_BRAND_ID}/citations`);

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(`a[href="${BRAND_URL}"]`).first()).toBeVisible();
	});

	// Membership in the organization is what grants access, and the brand is looked
	// up inside it — so another tenant's brand is absent here, not forbidden.
	test("a brand from another organization does not resolve under this one", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/brand/${NIKE_BRAND_ID}`);
		await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
	});

	test("the organization settings page states the organization's slug", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);
		await expect(page.getByLabel("Organization Slug", { exact: true })).toHaveValue(TEST_ORG_SLUG, {
			timeout: 30_000,
		});
	});

	test("the brand's slug is a field of the brand settings form", async ({ page }) => {
		await page.goto(`${SLUGGED_BRAND_URL}/settings/brand`);

		await expect(page.getByLabel("Brand Slug", { exact: true })).toHaveValue(SLUGGED_BRAND_SLUG, {
			timeout: 30_000,
		});
		await expect(page.getByRole("button", { name: "Change URL" })).toHaveCount(0);
	});

	test("the breadcrumb trail names the organization, the brand, and the page", async ({ page }) => {
		await page.goto(`${BRAND_URL}/citations`);

		const trail = page.getByRole("navigation", { name: "breadcrumb" });
		await expect(trail.getByText(TEST_BRAND_NAME, { exact: true })).toBeVisible({ timeout: 30_000 });
		await expect(trail.getByText("Citations", { exact: true })).toBeVisible();

		// Named as an organization, so it doesn't read as another brand.
		await expect(trail.getByText(/Organization$/)).toBeVisible();
		// The organization crumb leads back to the organization, not to the brand.
		await expect(trail.locator(`a[href="${organizationUrl()}"]`)).toBeVisible();
	});

	test("an organization page's trail leads with the organization", async ({ page }) => {
		await page.goto(`${organizationUrl()}/settings/brands`);

		const trail = page.getByRole("navigation", { name: "breadcrumb" });
		// The organization crumb leads to the settings, so the trail doesn't say it too.
		await expect(trail.locator(`a[href="${organizationUrl()}"]`)).toBeVisible({ timeout: 30_000 });
		await expect(trail.getByText("Brands", { exact: true })).toBeVisible();
		await expect(trail.getByText("Settings", { exact: true })).toHaveCount(0);
	});
});
