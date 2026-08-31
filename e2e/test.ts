import { type ConsoleMessage, type Page, expect, test as base } from "@playwright/test";

export type ConsoleErrorPattern = string | RegExp;

const ALWAYS_ALLOWED: ConsoleErrorPattern[] = [/t[0-9]\.gstatic\.com/];

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

function describeConsoleError(message: ConsoleMessage): string {
	const { url, lineNumber } = message.location();
	return `[console.error] ${message.text()}${url ? ` (${url}:${lineNumber})` : ""}`;
}

export { expect };
