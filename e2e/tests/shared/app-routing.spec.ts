import { expect, test } from "@playwright/test";
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

const BRAND_URL = brandUrl();
const SLUGGED_BRAND_URL = brandUrl(SLUGGED_BRAND_SLUG);

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

	test("an unknown page offers everything the user can reach", async ({ page }) => {
		await page.goto("/app/org/not-a-organization");

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("link", { name: TEST_BRAND_NAME, exact: true }).first()).toBeVisible();
	});

	test("the mark on a full-page view leads to the directory", async ({ page }) => {
		await page.goto("/app/org/not-a-organization");

		const mark = page.getByRole("link", { name: "Go to your organizations" });
		await expect(mark).toBeVisible({ timeout: 30_000 });
		await expect(mark).toHaveAttribute("href", "/app");

		await page.goto("/appadsf");
		await expect(page.getByRole("link", { name: "Go to your organizations" })).toHaveAttribute("href", "/app", {
			timeout: 30_000,
		});
	});

	test("a pre-organization link lands on the same directory", async ({ page }) => {
		await page.goto(`/app/${TEST_BRAND_ID}/citations`);

		await expect(page.getByText("That page doesn't exist or moved.")).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(`a[href="${BRAND_URL}"]`).first()).toBeVisible();
	});

	test("a brand from another organization does not resolve under this one", async ({ page }) => {
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
