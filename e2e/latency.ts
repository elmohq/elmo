import { type Page, expect } from "@playwright/test";

export interface SlowNetwork {
	/** Resolve once the responses this is holding back have all landed. */
	settled(): Promise<void>;
}

/**
 * Hold the app's data responses back so a client-side navigation actually
 * reaches the router's pending state.
 *
 * Against a local stack a loader resolves in single-digit milliseconds, well
 * under the router's `defaultPendingMs`, so the window a navigation bug lives
 * in — the old page still mounted while the new data is still in flight —
 * never opens, and the page that eventually settles looks fine. Real
 * deployments cross that threshold routinely; this makes the suite cross it on
 * purpose.
 *
 * Install it once the first page has loaded: delaying the cold load only makes
 * the test slower.
 */
export async function delayDataRequests(page: Page, delayMs = 400): Promise<SlowNetwork> {
	let inFlight = 0;
	let lastActivity = Date.now();

	await page.route("**/_serverFn/**", async (route) => {
		inFlight++;
		lastActivity = Date.now();
		try {
			// Fetch first and delay the reply, so what's slow is the network and
			// not the moment the request leaves.
			const response = await route.fetch();
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			await route.fulfill({ response });
		} finally {
			inFlight--;
			lastActivity = Date.now();
		}
	});

	return {
		async settled() {
			// A loader that lands can start the next one, so a single moment at
			// zero is not the same as being done.
			await expect
				.poll(() => inFlight === 0 && Date.now() - lastActivity > delayMs / 2, { intervals: [50], timeout: 30_000 })
				.toBe(true);
		},
	};
}
