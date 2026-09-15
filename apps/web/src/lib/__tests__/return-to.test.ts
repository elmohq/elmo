import { afterEach, describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/return-to";

const ORIGIN = "https://app.example.com";

/** The unit project runs without a DOM, so the browser branch is opted into. */
function withWindow(origin: string) {
	Object.defineProperty(globalThis, "window", {
		value: { location: { origin } },
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("safeReturnTo", () => {
	it("keeps a path on this origin", () => {
		withWindow(ORIGIN);
		expect(safeReturnTo("/app/org/acme")).toBe("/app/org/acme");
		expect(safeReturnTo("/app?tab=prompts#top")).toBe("/app?tab=prompts#top");
	});

	it("falls back when there is nothing to return to", () => {
		withWindow(ORIGIN);
		expect(safeReturnTo(undefined)).toBe("/app");
		expect(safeReturnTo("")).toBe("/app");
	});

	it("keeps an absolute URL that is already on this origin", () => {
		withWindow(ORIGIN);
		expect(safeReturnTo(`${ORIGIN}/app/org/acme`)).toBe("/app/org/acme");
	});

	// Each of these reads as root-relative and each resolves to another origin
	// once a browser parses it: `\` is normalized to `/`, and tabs and newlines
	// are stripped before parsing.
	it.each([
		["a backslash", "/\\evil.com"],
		["doubled backslashes", "/\\\\evil.com"],
		["a backslash before a slash", "/\\/evil.com"],
		["an embedded tab", "/\t/evil.com"],
		["an embedded newline", "/\n/evil.com"],
		["an embedded carriage return", "/\r/evil.com"],
	])("refuses a path that escapes the origin with %s", (_label, returnTo) => {
		withWindow(ORIGIN);
		expect(safeReturnTo(returnTo)).toBe("/app");
	});

	it.each([
		["a protocol-relative URL", "//evil.com"],
		["an absolute URL elsewhere", "https://evil.com/app"],
		["a lookalike host", "https://app.example.com.evil.com/app"],
		["a non-http scheme", "javascript:alert(1)"],
	])("refuses %s", (_label, returnTo) => {
		withWindow(ORIGIN);
		expect(safeReturnTo(returnTo)).toBe("/app");
	});

	describe("off the browser", () => {
		it("still keeps a plain path", () => {
			expect(safeReturnTo("/app/org/acme")).toBe("/app/org/acme");
		});

		it("still refuses one that escapes the origin", () => {
			expect(safeReturnTo("/\\evil.com")).toBe("/app");
			expect(safeReturnTo("//evil.com")).toBe("/app");
		});

		it("refuses an absolute URL, having no origin to compare against", () => {
			expect(safeReturnTo(`${ORIGIN}/app`)).toBe("/app");
		});
	});
});
