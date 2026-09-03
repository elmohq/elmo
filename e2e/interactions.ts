/**
 * Interactions that have to wait for React to take over.
 *
 * Pages arrive server-rendered, so a control is in the DOM and passes every
 * actionability check Playwright makes — visible, enabled, stable, hit-testable
 * — before its handler is attached. Anything landing in that window is
 * swallowed: a click that opens nothing, a fill the form never registers. The
 * app publishes no hydration signal, so these repeat the interaction until it
 * takes, which is the only evidence available that the page is listening.
 *
 * Both were real: the account menu failed in whichever mode happened to hydrate
 * slowest, and a swallowed fill left a dirty-gated Save button disabled for a
 * test's whole 60s timeout.
 */
import { type Locator, type Page, expect } from "@playwright/test";

/** Long enough to outlast a cold hydration, short enough to fail a broken page
 * well inside the 60s test timeout. */
const HYDRATION = 30_000;

/** One attempt's worth of waiting, so a swallowed interaction is retried
 * rather than waited out. */
const ATTEMPT = 1_000;

/**
 * Opens the account menu and hands back its content.
 *
 * The trigger toggles, so a repeat clicks only while the menu is still closed —
 * otherwise a retry would shut the menu the previous click had just opened.
 */
export async function openAccountMenu(page: Page): Promise<Locator> {
	const trigger = page.getByRole("button", { name: "Account and organizations" });
	const menu = page.getByRole("menu");

	await expect(async () => {
		if (!(await menu.isVisible())) await trigger.click();
		await expect(menu).toBeVisible({ timeout: ATTEMPT });
	}).toPass({ timeout: HYDRATION });

	return menu;
}

/**
 * Fills a field and returns once the form has registered the edit, which is
 * what takes its save button out of the disabled state.
 */
export async function fillUntilSaveable(field: Locator, value: string, save: Locator): Promise<void> {
	await expect(async () => {
		// Reset the input in case it holds text from a prior attempt.
		await field.fill("");
		await field.fill(value);
		await expect(save).toBeEnabled({ timeout: ATTEMPT });
	}).toPass({ timeout: HYDRATION });
}
