/**
 * Which deployments load the support chat.
 *
 * Crisp routes into a support inbox we operate, so it belongs on cloud and demo
 * and nowhere else. The deployment-mode gate is unit-tested as a pure function
 * (apps/web/src/server/config.ts); what this adds is that the running server
 * actually honours it — a config or root-route change that leaked the widget
 * onto a self-hosted or whitelabel instance would pass the unit tests.
 *
 * Nothing here reaches Crisp: every request to their hosts is aborted in the
 * browser, and the assertion reads the loader the app injected rather than a
 * booted chatbox. (Their loader refuses to run under a headless user agent
 * anyway, so the widget would never open in CI.)
 */
import { expect, test } from "@playwright/test";
import { isDeploymentMode, TEST_BRAND_ID } from "../../fixtures";

const CRISP_HOSTS = "**://*.crisp.chat/**";

/** True on the deployments we operate, which are the ones that get the widget. */
function expectsSupportChat(mode: string): boolean {
  return mode === "cloud" || mode === "demo";
}

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

    await page.goto(`/app/${TEST_BRAND_ID}`);
    // The loader runs in the root route's effect, so waiting for a hydrated
    // dashboard means it has either run or is never going to.
    await expect(page.locator(`a[href="/app/${TEST_BRAND_ID}"][data-sidebar="menu-button"]`)).toBeVisible({
      timeout: 30_000,
    });

    const readLoader = () =>
      page.evaluate(() => ({
        websiteId: (window as unknown as { CRISP_WEBSITE_ID?: string }).CRISP_WEBSITE_ID ?? null,
        loaderScripts: document.querySelectorAll('script[src*="crisp.chat"]').length,
      }));

    if (expectsSupportChat(mode)) {
      await expect.poll(async () => (await readLoader()).websiteId, { timeout: 15_000 }).not.toBeNull();
      expect((await readLoader()).loaderScripts).toBeGreaterThan(0);
    } else {
      expect(await readLoader()).toEqual({ websiteId: null, loaderScripts: 0 });
      expect(requestedCrisp, "a deployment we do not operate must not call Crisp").toBe(false);
    }
  });
});
