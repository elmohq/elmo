import type { Page } from "@playwright/test";
import { brandUrl, organizationUrl } from "../../fixtures";
import { openAccountMenu } from "../../interactions";
import { expect, test } from "../../test";

/**
 * Long enough that a navigation with a loader crosses the router's pending
 * threshold, which is when it publishes the destination's layouts before their
 * data has all arrived. The shell has to be built from what survives that, or
 * the rail flashes an error card on the way to the page.
 */
const SERVER_CALL_DELAY_MS = 1_200;

declare global {
  interface Window {
    __sameDocument?: boolean;
  }
}

test.describe("App shell", () => {
  test("stays mounted through slow navigations between a brand and its organization", async ({ page }) => {
    await page.route(/\/_serverFn\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SERVER_CALL_DELAY_MS));
      await route.continue();
    });

    await page.goto(brandUrl());
    // Opening the menu is the one signal that React has taken over the page.
    await openAccountMenu(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();

    const sidebar = await page.locator('[data-slot="sidebar"]').elementHandle();
    expect(sidebar).not.toBeNull();

    const steps: Array<[selector: string, destination: string]> = [
      [`a[href="${brandUrl()}/citations"]`, `${brandUrl()}/citations`],
      [`nav[aria-label="breadcrumb"] a[href="${organizationUrl()}"]`, `${organizationUrl()}/settings`],
      [`a[href="${organizationUrl()}/settings/brands"]`, `${organizationUrl()}/settings/brands`],
      [`a[href="${brandUrl()}"]`, brandUrl()],
    ];
    for (const [selector, destination] of steps) {
      await clientNavigate(page, selector, destination);
      expect(await sidebar?.evaluate((node) => node.isConnected), `the sidebar survived arriving at ${destination}`).toBe(
        true,
      );
    }

    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});

/**
 * Clicks a link and waits for the router to land on the destination. A click
 * the page was not yet listening to would navigate the document instead, which
 * passes the URL check while exercising nothing, so the marker set on the
 * window has to survive the trip.
 */
async function clientNavigate(page: Page, selector: string, destination: string): Promise<void> {
  await page.evaluate(() => {
    window.__sameDocument = true;
  });
  await page.locator(selector).first().click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(destination)}$`), { timeout: 30_000 });
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
