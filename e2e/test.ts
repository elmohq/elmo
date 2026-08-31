/**
 * The `test` every spec imports: Playwright's, plus a guard that fails a test
 * when the browser console reports an error the spec didn't ask for.
 *
 * New shared fixtures belong here rather than in fixtures.ts, which stays a
 * side-effect-free bag of constants the seeder can import too.
 */
import { type ConsoleMessage, type Page, expect, test as base } from "@playwright/test";

export type ConsoleErrorPattern = string | RegExp;

/** Noise no deployment controls. Anything the app itself logs belongs in the spec that provokes it. */
const ALWAYS_ALLOWED: ConsoleErrorPattern[] = [/t[0-9]\.gstatic\.com/];

/** `from` matches the failing request's URL, so allowing one refusal doesn't excuse the rest. */
export const failedResource = (status: number, from: string): RegExp =>
	new RegExp(`Failed to load resource: the server responded with a status of ${status}\\D.*${escapeRegExp(from)}`);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** React's code for an SSR stream that ended early, which a redirect mid-stream causes. */
export const ABORTED_SSR_STREAM = /Minified React error #419/;

export interface ConsoleErrorCollector {
	/** Matched after the test body, so where the call sits does not change what it covers. */
	allow(...patterns: ConsoleErrorPattern[]): void;
	recorded(): string[];
}

export interface ConsoleErrorOptions {
	allowedConsoleErrors: ConsoleErrorPattern[];
}

interface ConsoleErrorLog {
	recorded: string[];
	allowed: ConsoleErrorPattern[];
}

export const test = base.extend<
	ConsoleErrorOptions & { consoleErrors: ConsoleErrorCollector; _consoleErrorLog: ConsoleErrorLog }
>({
	allowedConsoleErrors: [[], { option: true }],

	_consoleErrorLog: [
		async ({ allowedConsoleErrors }, use, testInfo) => {
			const log: ConsoleErrorLog = { recorded: [], allowed: [...ALWAYS_ALLOWED, ...allowedConsoleErrors] };

			await use(log);

			// A failed test already reports its cause; its console errors are usually that same failure again.
			if (testInfo.status !== testInfo.expectedStatus) return;

			// One broken render repeats itself as React retries.
			const unexpected = [...new Set(log.recorded)].filter(
				(entry) => !log.allowed.some((pattern) => matches(entry, pattern)),
			);
			expect(unexpected, "the browser console reported errors this test did not allow").toEqual([]);
		},
		{ auto: true },
	],

	consoleErrors: async ({ _consoleErrorLog }, use) => {
		await use({
			allow: (...patterns) => _consoleErrorLog.allowed.push(...patterns),
			recorded: () => [..._consoleErrorLog.recorded],
		});
	},

	// Listening here rather than in the auto fixture keeps specs that only take
	// `request` from paying for a browser context they never use.
	context: async ({ context, _consoleErrorLog }, use) => {
		const watch = (page: Page) => {
			page.on("console", (message) => {
				if (message.type() === "error") _consoleErrorLog.recorded.push(describeConsoleError(message));
			});
			page.on("pageerror", (error) => {
				_consoleErrorLog.recorded.push(`[pageerror] ${error.message}`);
			});
		};
		for (const page of context.pages()) watch(page);
		context.on("page", watch);

		await use(context);
	},
});

function matches(entry: string, pattern: ConsoleErrorPattern): boolean {
	return typeof pattern === "string" ? entry.includes(pattern) : pattern.test(entry);
}

/** A failed load says only "Failed to load resource", so the location is what identifies which one. */
function describeConsoleError(message: ConsoleMessage): string {
	const { url, lineNumber } = message.location();
	return `[console.error] ${message.text()}${url ? ` (${url}:${lineNumber})` : ""}`;
}

export { expect };
