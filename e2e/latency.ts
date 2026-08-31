import { type Page, expect } from "@playwright/test";

/**
 * Hold the app's data responses back so a client-side navigation actually
 * reaches the router's pending state. Against a local stack a loader resolves
 * well under the router's `defaultPendingMs`, so the window a navigation bug
 * lives in never opens. Install it once the first page has loaded; delaying
 * the cold load only makes the test slower.
 *
 * The returned wait reports how many responses it held back since the last
 * call, so a caller can tell a real transition from a cache hit.
 */
export async function delayDataRequests(page: Page, delayMs = 400): Promise<() => Promise<number>> {
	let inFlight = 0;
	let delayed = 0;
	let lastActivity = Date.now();

	await page.route("**/_serverFn/**", async (route) => {
		inFlight++;
		delayed++;
		lastActivity = Date.now();
		try {
			// Fetch first and delay the reply, so what's slow is the network and not the request leaving.
			const response = await route.fetch();
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			await route.fulfill({ response });
		} catch {
			// The page moved on and there is nobody left to answer.
		} finally {
			inFlight--;
			lastActivity = Date.now();
		}
	});

	return async () => {
		// Quiet is measured from this call because the navigation being waited on
		// may not have issued its requests yet.
		const calledAt = Date.now();
		await expect
			.poll(() => inFlight === 0 && Date.now() - Math.max(lastActivity, calledAt) > delayMs, {
				intervals: [50],
				timeout: 30_000,
			})
			.toBe(true);

		const observed = delayed;
		delayed = 0;
		return observed;
	};
}
