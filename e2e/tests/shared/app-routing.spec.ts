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
	SLUGGED_BRAND_NAME,
	SLUGGED_BRAND_SLUG,
	TEST_BRAND_ID,
	TEST_BRAND_NAME,
	TEST_ORG_SLUG,
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

		await page.goto(`/app/org/${TEST_ORG_SLUG}/new`);
		await expect(page).toHaveURL(/\/app\/org\/[^/]+\/(new|$)/, { timeout: 30_000 });
	});

	test("a link from before workspaces were in the URL is offered its new address", async ({ page }) => {
		// The shape dunning mail and whitelabel parent dashboards used to mint.
		// There is no compatibility route any more — the 404 resolves it instead,
		// which is what makes the move visible to whoever is still minting them.
		await page.goto(`/app/${TEST_BRAND_ID}/citations`);

		const link = page.getByRole("link", { name: new RegExp(`Go to ${TEST_BRAND_NAME}`, "i") });
		await expect(link).toBeVisible({ timeout: 30_000 });
		await expect(link).toHaveAttribute("href", `${BRAND_URL}/citations`);

		await link.click();
		await expect(page).toHaveURL(new RegExp(`${BRAND_URL}/citations$`), { timeout: 30_000 });
	});

	test("a stranded link to a slugged brand points at its slug, not its id", async ({ page }) => {
		await page.goto(`/app/${SLUGGED_BRAND_ID}`);

		const link = page.getByRole("link", { name: new RegExp(`Go to ${SLUGGED_BRAND_NAME}`, "i") });
		await expect(link).toBeVisible({ timeout: 30_000 });
		await expect(link).toHaveAttribute("href", SLUGGED_BRAND_URL);
	});

	test("an unknown workspace offers the ones the user can reach", async ({ page }) => {
		await page.goto("/app/org/not-a-workspace");

		await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("link", { name: TEST_BRAND_NAME, exact: true }).first()).toBeVisible();
	});

	// Membership in the workspace is what grants access, and the brand is looked
	// up inside it — so another tenant's brand is absent here, not forbidden.
	test("a brand from another workspace does not resolve under this one", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/brand/${NIKE_BRAND_ID}`);
		await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
	});

	test("the workspace settings page states the workspace's URL", async ({ page }) => {
		await page.goto(`/app/org/${TEST_ORG_SLUG}/settings`);
		await expect(page.getByLabel("URL", { exact: true })).toHaveValue(TEST_ORG_SLUG, { timeout: 30_000 });
	});
});
