import { createHash } from "node:crypto";
import { type ConsoleMessage, type Page, expect, test as base } from "@playwright/test";

export type ConsoleErrorPattern = string | RegExp;

/**
 * Crisp, blocked below, and the failure that blocking prints.
 *
 * The widget is configured on the deployments we operate, so cloud and demo
 * load it. Letting the browser fetch it makes the suite depend on which origins
 * Crisp's CDN is willing to serve — it answers localhost:1515 and refuses the
 * ports the other modes run on, which is nothing this suite has an opinion
 * about. support-chat.spec.ts asserts on the loader Elmo installs, and that is
 * in the DOM either way.
 */
export const CRISP_HOSTS = "**://*.crisp.chat/**";

const ALWAYS_ALLOWED: ConsoleErrorPattern[] = [
	/t[0-9]\.gstatic\.com/,
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
 * A client address of this test's own, sent as `X-Forwarded-For`.
 *
 * better-auth rate-limits `/sign-in*` and `/sign-up*` to three requests per ten
 * seconds per client IP, and when it cannot resolve one it puts every caller in
 * a single shared bucket. Nothing in front of the container sets the header, so
 * the whole suite counted as one client: four parallel workers signing in spent
 * each other's budget and the loser got a 429 it had no way to report. One
 * address per test is what the limiter assumes anyway — separate people sign in
 * from separate places.
 *
 * Private space (RFC 1918), and wide enough that the digest does not collide.
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

	// Exposed so a spec building its own context (see mcp.spec.ts) can present
	// the same client the fixtures do, rather than falling back to the shared
	// bucket this fixture exists to escape.
	clientHeaders: async ({}, use, testInfo) => {
		// Keyed on the attempt, not just the test: a retry that reused the address
		// would inherit a budget the failed attempt had already spent, and ten
		// seconds is long enough that a retry lands inside it.
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

	// Listening here rather than in the auto fixture above keeps a spec that only
	// takes `request` from building a browser context it never uses.
	context: async ({ context, _consoleErrorLog }, use) => {
		// A page route still wins over this one, so a spec can watch the requests
		// it aborts (see support-chat.spec.ts).
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
