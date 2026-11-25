/**
 * The mode gate is unit-tested; this checks the running server honours it.
 * Crisp is aborted suite-wide (see e2e/test.ts); this spec's own route counts
 * what a quiet mode still tried to fetch.
 */
import { CRISP_HOSTS, expect, test } from "../../test";
import { TEST_BRAND_ID, brandUrl, isDeploymentMode } from "../../fixtures";

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

    const supportButton = page.getByRole("button", { name: /^Support chat/ });

    if (mode === "cloud" || mode === "demo") {
      await expect.poll(readLoader, { timeout: 15_000 }).toEqual({ websiteId: expect.any(String), loaderScripts: 1 });
      // The demo keeps Crisp's own floating launcher instead.
      if (mode === "cloud") await expect(supportButton).toBeVisible();
      else await expect(supportButton).toHaveCount(0);
    } else {
      expect(await readLoader()).toEqual({ websiteId: null, loaderScripts: 0 });
      await expect(supportButton).toHaveCount(0);
      expect(requestedCrisp, "a deployment we do not operate must not call Crisp").toBe(false);
    }
  });
});
