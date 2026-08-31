/**
 * The `test` every spec imports: Playwright's, plus a guard that fails a test
 * when the browser console reports an error the spec didn't ask for.
 *
 * A broken page announces itself in the console long before an assertion
 * notices — an error boundary rendering for a frame, a component reading data
 * a pending navigation hasn't produced yet, a request failing in the
 * background. Failing on those by default means every spec covers them, not
 * just the ones that thought to look.
 *
 * Errors a spec provokes on purpose are declared rather than ignored globally:
 *
 *   test.use({ allowedConsoleErrors: [/quota exceeded/] });   // file or describe
 *
 *   test("...", async ({ page, consoleErrors }) => {
 *     consoleErrors.allow(failedResource(404, "/reports"));   // this test only
 *   });
 *
 * New shared fixtures belong here rather than in fixtures.ts, which stays a
 * side-effect-free bag of constants the seeder can import too.
 */
import { type ConsoleMessage, type Page, expect, test as base } from "@playwright/test";

/** Matched against the recorded entry, which carries both text and source URL. */
export type ConsoleErrorPattern = string | RegExp;

/**
 * Noise no deployment controls and no user would call a bug. Keep this list
 * short — anything the app itself logs belongs in the spec that provokes it.
 */
const ALWAYS_ALLOWED: ConsoleErrorPattern[] = [
	// Favicons are fetched from Google's service; whether it has one for a
	// seeded domain is not ours to decide.
	/t[0-9]\.gstatic\.com/,
];

/**
 * What Chromium logs when a request comes back with an error status, tied to
 * where the spec expects it from — `from` is matched against the failing
 * request's URL. A spec that provokes one refusal on purpose should not thereby
 * excuse every other refusal of that status on the page, which is the whole
 * point of allowing narrowly.
 */
export const failedResource = (status: number, from: string): RegExp =>
	new RegExp(`Failed to load resource: the server responded with a status of ${status}\\D.*${escapeRegExp(from)}`);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * React's code for an SSR stream that ended early. A route that answers with a
 * redirect abandons the stream it had started, and the client renders that
 * subtree itself instead.
 */
export const ABORTED_SSR_STREAM = /Minified React error #419/;

export interface ConsoleErrorCollector {
	/**
	 * Permit errors matching these patterns for this test, wherever in it they
	 * occur — the recorded entries are matched once, after the test body, so
	 * where the call sits does not change what it covers.
	 */
	allow(...patterns: ConsoleErrorPattern[]): void;
	/** Everything recorded so far, allowed or not, in order. */
	recorded(): string[];
}

export interface ConsoleErrorOptions {
	allowedConsoleErrors: ConsoleErrorPattern[];
}

interface ConsoleErrorFixtures {
	consoleErrors: ConsoleErrorCollector;
}

export const test = base.extend<ConsoleErrorOptions & ConsoleErrorFixtures>({
	allowedConsoleErrors: [[], { option: true }],

	consoleErrors: [
		async ({ context, allowedConsoleErrors }, use, testInfo) => {
			const allowed = [...ALWAYS_ALLOWED, ...allowedConsoleErrors];
			const recorded: string[] = [];

			// Popups and pages a spec opens itself are watched too, so where the
			// error surfaces doesn't decide whether it's caught.
			const watch = (page: Page) => {
				page.on("console", (message) => {
					if (message.type() === "error") recorded.push(describeConsoleError(message));
				});
				page.on("pageerror", (error) => {
					recorded.push(`[pageerror] ${error.message}`);
				});
			};
			for (const page of context.pages()) watch(page);
			context.on("page", watch);

			await use({
				allow: (...patterns) => allowed.push(...patterns),
				recorded: () => [...recorded],
			});

			// A test that already failed has a cause worth reading on its own; the
			// console error it also produced is usually that same failure again.
			if (testInfo.status !== testInfo.expectedStatus) return;

			// One broken render repeats itself as React retries, so report the
			// distinct errors rather than a wall of the same one.
			const unexpected = [...new Set(recorded)].filter((entry) => !allowed.some((pattern) => matches(entry, pattern)));
			expect(unexpected, "the browser console reported errors this test did not allow").toEqual([]);
		},
		{ auto: true },
	],
});

function matches(entry: string, pattern: ConsoleErrorPattern): boolean {
	return typeof pattern === "string" ? entry.includes(pattern) : pattern.test(entry);
}

/**
 * A failed resource load says only "Failed to load resource", so the location
 * is part of the entry — it is the only thing that identifies which one.
 */
function describeConsoleError(message: ConsoleMessage): string {
	const { url, lineNumber } = message.location();
	return `[console.error] ${message.text()}${url ? ` (${url}:${lineNumber})` : ""}`;
}

export { expect };
