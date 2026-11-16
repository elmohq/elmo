import { createHash } from "node:crypto";
import { type ConsoleMessage, type Page, expect, test as base } from "@playwright/test";

export type ConsoleErrorPattern = string | RegExp;

/**
 * Blocked, because Crisp's CDN serves some localhost ports and refuses others.
 * support-chat.spec.ts asserts on Elmo's loader, which is in the DOM either way.
 */
export const CRISP_HOSTS = "**://*.crisp.chat/**";

const ALWAYS_ALLOWED: ConsoleErrorPattern[] = [
	/\/api\/site-icon\?/,
	/Failed to load resource: net::ERR_FAILED.*crisp\.chat/,
];

export const failedResource = (status: number, from: string): RegExp =>
	new RegExp(`Failed to load resource: the server responded with a status of ${status}\\D.*${escapeRegExp(from)}`);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const ABORTED_SSR_STREAM = /Minified React error #419/;

export interface ConsoleErrorCollector {
	allow(...patterns: ConsoleErrorPattern[]): void;
	recorded(): string[];
}

/**
 * better-auth rate-limits sign-in and sign-up per client IP, and puts callers
 * with no resolvable IP in one shared bucket, so parallel workers would 429
 * each other. Each test attempt gets its own private (RFC 1918) address.
 */
function syntheticClientIp(seed: string): string {
	const [a, b, c] = createHash("sha256").update(seed).digest();
	return `10.${a}.${b}.${c}`;
}

export interface ConsoleErrorOptions {
	allowedConsoleErrors: ConsoleErrorPattern[];
}

interface ConsoleErrorLog {
	recorded: string[];
	allowed: ConsoleErrorPattern[];
}

export const test = base.extend<
	ConsoleErrorOptions & {
		consoleErrors: ConsoleErrorCollector;
		clientHeaders: Record<string, string>;
		_consoleErrorLog: ConsoleErrorLog;
	}
>({
	allowedConsoleErrors: [[], { option: true }],

	// Exposed for specs that build their own context (see mcp.spec.ts).
	clientHeaders: async ({}, use, testInfo) => {
		// Keyed on the retry too, or a retry would inherit the failed attempt's spent budget.
		await use({ "X-Forwarded-For": syntheticClientIp(`${testInfo.testId}#${testInfo.retry}`) });
	},

	extraHTTPHeaders: async ({ extraHTTPHeaders, clientHeaders }, use) => {
		await use({ ...extraHTTPHeaders, ...clientHeaders });
	},

	_consoleErrorLog: [
		async ({ allowedConsoleErrors }, use, testInfo) => {
			const log: ConsoleErrorLog = { recorded: [], allowed: [...ALWAYS_ALLOWED, ...allowedConsoleErrors] };

			await use(log);

			if (testInfo.status !== testInfo.expectedStatus) return;

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

	// Here rather than in the auto fixture, so a spec that only takes `request` builds no browser context.
	context: async ({ context, _consoleErrorLog }, use) => {
		// A page route still wins over this one (see support-chat.spec.ts).
		await context.route(CRISP_HOSTS, (route) => route.abort());

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

function describeConsoleError(message: ConsoleMessage): string {
	const { url, lineNumber } = message.location();
	return `[console.error] ${message.text()}${url ? ` (${url}:${lineNumber})` : ""}`;
}

export { expect };
