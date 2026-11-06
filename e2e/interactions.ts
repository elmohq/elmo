/**
 * Server-rendered controls pass every Playwright actionability check before
 * React attaches their handlers, so a click or fill in that window is
 * swallowed. The app publishes no hydration signal, so these repeat the
 * interaction until it takes.
 */
import { type Locator, type Page, expect } from "@playwright/test";

/** Outlasts a cold hydration while failing a broken page well inside the 60s test timeout. */
const HYDRATION = 30_000;

/** Short, so a swallowed interaction is retried rather than waited out. */
const ATTEMPT = 1_000;

/** The trigger toggles, so a retry clicks only while the menu is still closed. */
export async function openAccountMenu(page: Page): Promise<Locator> {
	const trigger = page.getByRole("button", { name: "Account and organizations" });
	const menu = page.getByRole("menu");

	await expect(async () => {
		if (!(await menu.isVisible())) await trigger.click();
		await expect(menu).toBeVisible({ timeout: ATTEMPT });
	}).toPass({ timeout: HYDRATION });

	return menu;
}

export async function fillUntilSaveable(field: Locator, value: string, save: Locator): Promise<void> {
	await expect(async () => {
		await field.fill("");
		await field.fill(value);
		await expect(save).toBeEnabled({ timeout: ATTEMPT });
	}).toPass({ timeout: HYDRATION });
}

/**
 * Playwright's stability check can pass mid-animation, and Base UI drops a pick
 * whose press and release land on different elements. Looping spinners never
 * finish, so they are left out.
 */
export async function waitForMotion(page: Page): Promise<void> {
	await page.evaluate(() =>
		Promise.all(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
				.map((animation) => animation.finished.catch(() => undefined)),
		),
	);
}
