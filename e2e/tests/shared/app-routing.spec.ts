import {
	NIKE_BRAND_ID,
	SLUGGED_BRAND_ID,
	SLUGGED_BRAND_SLUG,
	TEST_BRAND_ID,
	TEST_BRAND_NAME,
	TEST_ORGANIZATION_NAME,
	TEST_ORG_SLUG,
	brandUrl,
	organizationUrl,
} from "../../fixtures";
import { delayDataRequests } from "../../latency";
import { expect, failedResource, test } from "../../test";

const BRAND_URL = brandUrl();
const SLUGGED_BRAND_URL = brandUrl(SLUGGED_BRAND_SLUG);
const BOUNDARY = "An unexpected error occurred while loading this page.";

test.describe("App routing", () => {
	test("a brand with no slug resolves by id", async ({ page }) => {
		await page.goto(BRAND_URL);
		await expect(page).toHaveURL(new RegExp(`${BRAND_URL}$`), { timeout: 30_000 });
		await expect(page.locator(`a[href="${BRAND_URL}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 30_000 });
	});

	test("a brand with a slug resolves by it, and its id canonicalizes to it", async ({ page }) => {
		await page.goto(SLUGGED_BRAND_URL);
		await expect(page).toHaveURL(new RegExp(`${SLUGGED_BRAND_URL}$`), { timeout: 30_000 });

		await page.goto(`${brandUrl(SLUGGED_BRAND_ID)}/citations`);
		await expect(page).toHaveURL(new RegExp(`${SLUGGED_BRAND_URL}/citations$`), { timeout: 30_000 });
	});

	test("route names are reachable as organization pages", async ({ page }) => {
		await page.goto(`${organizationUrl()}/settings`);
		await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible({ timeout: 30_000 });

		await page.goto(`${organizationUrl()}/new`);
		await expect(page).toHaveURL(new RegExp(`${organizationUrl()}(?:/new|/settings)?/?$`), {
			timeout: 30_000,
		});
	});

	test("an unknown page offers everything the user can reach", async ({ page, consoleErrors }) => {
		consoleErrors.allow(failedResource(404, "/app/org/not-a-organization"));
		await page.goto("/app/org/not-a-organization");

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("link", { name: TEST_BRAND_NAME, exact: true }).first()).toBeVisible();
	});

	test("the mark on a full-page view leads to the directory", async ({ page, consoleErrors }) => {
		consoleErrors.allow(failedResource(404, "/app/org/not-a-organization"), failedResource(404, "/appadsf"));
		await page.goto("/app/org/not-a-organization");

		const mark = page.getByRole("link", { name: "Go to your organizations" });
		await expect(mark).toBeVisible({ timeout: 30_000 });
		await expect(mark).toHaveAttribute("href", "/app");

		await page.goto("/appadsf");
		await expect(page.getByRole("link", { name: "Go to your organizations" })).toHaveAttribute("href", "/app", {
			timeout: 30_000,
		});
	});

	test("a pre-organization link lands on the same directory", async ({ page, consoleErrors }) => {
		consoleErrors.allow(failedResource(404, `/app/${TEST_BRAND_ID}/citations`));
		await page.goto(`/app/${TEST_BRAND_ID}/citations`);

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(`a[href="${BRAND_URL}"]`).first()).toBeVisible();
	});

	test("a brand from another organization does not resolve under this one", async ({ page, consoleErrors }) => {
		consoleErrors.allow(failedResource(404, brandUrl(NIKE_BRAND_ID)));
		await page.goto(brandUrl(NIKE_BRAND_ID));
		await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
	});

	test("the organization settings page states the organization's slug", async ({ page }) => {
		await page.goto(`${organizationUrl()}/settings`);
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

	// The data is slowed down because what breaks a page mid-transition is gone
	// by the time the page settles; the console guard catches what these
	// assertions cannot see.
	test("walking the whole sidebar over a slow connection never breaks a page", async ({ page }) => {
		await page.goto(BRAND_URL);
		const destinations = page.locator(`a[data-sidebar="menu-button"][href^="${organizationUrl()}"]`);
		await expect(destinations.first()).toBeVisible({ timeout: 30_000 });
		const hrefs = await destinations.evaluateAll((links) => links.map((link) => link.getAttribute("href")!));

		const settled = await delayDataRequests(page);
		let delayedResponses = 0;

		for (const href of hrefs) {
			await page.locator(`a[data-sidebar="menu-button"][href="${href}"]`).click();
			await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 30_000 });
			delayedResponses += await settled();
			await expect(page.getByText(BOUNDARY), `navigating to ${href}`).toHaveCount(0);
		}

		expect(delayedResponses, "no navigation went to the network, so none of them was ever slow").toBeGreaterThan(0);
	});

	test("leaving a brand for its organization over a slow connection keeps the page intact", async ({ page }) => {
		await page.goto(`${BRAND_URL}/citations`);
		const organization = page.getByRole("navigation", { name: "breadcrumb" }).locator(`a[href="${organizationUrl()}"]`);
		await expect(organization).toBeVisible({ timeout: 30_000 });

		const settled = await delayDataRequests(page);

		await organization.click();
		expect(await settled(), "the organization page came from cache, so it was never slow").toBeGreaterThan(0);
		await expect(page.getByText(BOUNDARY)).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible({ timeout: 30_000 });
	});

	test("the breadcrumb trail names the organization, the brand, and the page", async ({ page }) => {
		await page.goto(`${BRAND_URL}/citations`);

		const trail = page.getByRole("navigation", { name: "breadcrumb" });
		const organization = trail.locator(`a[href="${organizationUrl()}"]`);
		const brand = trail.locator(`a[href="${BRAND_URL}"]`);

		await expect(organization).toContainText(TEST_ORGANIZATION_NAME, { timeout: 30_000 });
		await expect(brand).toContainText(TEST_BRAND_NAME);
		await expect(trail.getByText("Citations", { exact: true })).toBeVisible();

		await expect(organization.getByText("Organization", { exact: true })).toBeVisible();
		await expect(brand.getByText("Brand", { exact: true })).toBeVisible();
	});

	test("an organization page's trail leads with the organization", async ({ page }) => {
		await page.goto(`${organizationUrl()}/settings/brands`);

		const trail = page.getByRole("navigation", { name: "breadcrumb" });
		await expect(trail.locator(`a[href="${organizationUrl()}"]`)).toBeVisible({ timeout: 30_000 });
		await expect(trail.getByText("Brands", { exact: true })).toBeVisible();
		await expect(trail.getByText("Settings", { exact: true })).toHaveCount(0);
	});
});
