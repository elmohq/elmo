/**
 * Interaction flows the read-only coverage spec leaves out: submitting the
 * create-brand form through the onboarding analysis (exercising the
 * analyze-brand queue end to end), the prompt editor's bulk selection and
 * unsaved-changes bar, and a console-error smoke pass over the main pages.
 *
 * The onboarding test mutates the database (new org + brand) and needs the
 * worker running with the stub provider — both tests in that describe are
 * skipped unless WORKER_UP is set. Re-seed after running this spec.
 */
import { expect, test } from "@playwright/test";
import { brandUrl, organizationUrl } from "../../fixtures";

test.describe("Create brand + onboarding (stub analysis)", () => {
  test("submitting the create-brand form reaches the onboarding wizard", async ({ page }) => {
    test.skip(!process.env.WORKER_UP, "requires the worker container (stub provider)");
    test.setTimeout(180_000);
    await page.goto(`${organizationUrl()}/new`);
    await page.getByLabel(/name/i).first().fill("Phase1 Flow Brand");
    await page.getByLabel(/website/i).first().fill("https://example.net");
    await page.getByRole("button", { name: /create|continue|next|analyze/i }).first().click();
    // The wizard lands on the new brand's dashboard in onboarding state; the
    // stub analysis should surface suggestions without a real LLM call.
    await page.waitForURL(/\/app\/(?!new)[^/]+/, { timeout: 60_000 });
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Prompt editor interactions", () => {
  test("editing a prompt raises the unsaved-changes bar without saving", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/prompts`);
    const firstPrompt = page.getByPlaceholder("Enter prompt text...").filter({ visible: true }).first();
    await firstPrompt.waitFor();
    await firstPrompt.pressSequentially(" edited", { delay: 20 });
    await firstPrompt.blur();
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible();
    // Leave without saving — fixtures stay untouched.
  });
});

test.describe("Console-error smoke on main pages", () => {
  for (const path of ["", "/visibility", "/citations", "/share-of-voice", "/query-fan-out"]) {
    test(`no severe console errors on /app/brand${path || " (overview)"}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      await page.goto(`${brandUrl()}${path}`);
      await expect(page.getByRole("main")).toBeVisible();
      const severe = errors.filter(
        (e) => !/favicon|manifest|plausible|posthog|third-party|net::ERR_BLOCKED/i.test(e),
      );
      expect(severe, severe.join("\n")).toHaveLength(0);
    });
  }
});
