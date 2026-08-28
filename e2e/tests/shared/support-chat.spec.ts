/**
 * The deployment-mode gate is unit-tested as a pure function; this adds that the
 * running server honours it, which a config or root-route change could break
 * while the unit tests still pass.
 *
 * Requests to Crisp are aborted in the browser, so CI never reaches them.
 */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_ID, brandUrl, isDeploymentMode } from "../../fixtures";

const CRISP_HOSTS = "**://*.crisp.chat/**";

test.describe("Support chat", () => {
  test("loads on the deployments we operate, and only those", async ({ page }, testInfo) => {
    const mode = testInfo.project.name;
    if (!isDeploymentMode(mode)) {
      throw new Error(`Project "${testInfo.project.name}" does not name a deployment mode`);
    }

    let requestedCrisp = false;
    await page.route(CRISP_HOSTS, (route) => {
      requestedCrisp = true;
      return route.abort();
    });

    await page.goto(`${brandUrl()}`);
    // The loader runs in the root route's effect, so a hydrated dashboard means
    // it has either run or never will.
    await expect(page.locator(`a[href="${brandUrl()}"][data-sidebar="menu-button"]`)).toBeVisible({
      timeout: 30_000,
    });

    const readLoader = () =>
      page.evaluate(() => ({
        websiteId: (window as unknown as { CRISP_WEBSITE_ID?: string }).CRISP_WEBSITE_ID ?? null,
        loaderScripts: document.querySelectorAll('script[src*="crisp.chat"]').length,
      }));

    if (mode === "cloud" || mode === "demo") {
      await expect.poll(readLoader, { timeout: 15_000 }).toEqual({ websiteId: expect.any(String), loaderScripts: 1 });
    } else {
      expect(await readLoader()).toEqual({ websiteId: null, loaderScripts: 0 });
      expect(requestedCrisp, "a deployment we do not operate must not call Crisp").toBe(false);
    }
  });
});
