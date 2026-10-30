import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/return-to";

const ORIGIN = "https://app.example.com";

describe("safeReturnTo", () => {
	it("keeps a path within the app", () => {
		expect(safeReturnTo("/app/org/acme")).toBe("/app/org/acme");
		expect(safeReturnTo("/app?tab=prompts#top")).toBe("/app?tab=prompts#top");
		expect(safeReturnTo("/app/org/acme%20co")).toBe("/app/org/acme%20co");
	});

	it("falls back when there is nothing to return to", () => {
		expect(safeReturnTo(undefined)).toBe("/app");
		expect(safeReturnTo("")).toBe("/app");
	});

	it.each([
		["a protocol-relative URL", "//evil.com"],
		["a backslash", "/\\evil.com"],
		["doubled backslashes", "/\\\\evil.com"],
		["a backslash before a slash", "/\\/evil.com"],
		["a backslash further along", "/app\\evil.com"],
		["an embedded tab", "/\t/evil.com"],
		["an embedded newline", "/\n/evil.com"],
		["an embedded carriage return", "/\r/evil.com"],
		["a leading space", " //evil.com"],
		["an absolute URL elsewhere", "https://evil.com/app"],
		["a lookalike host", "https://app.example.com.evil.com/app"],
		["an absolute URL, even on this origin", `${ORIGIN}/app`],
		["a non-http scheme", "javascript:alert(1)"],
	])("refuses %s", (_label, returnTo) => {
		expect(safeReturnTo(returnTo)).toBe("/app");
	});

	it("keeps dot segments, which resolve back onto this origin", () => {
		expect(safeReturnTo("/.//evil.com")).toBe("/.//evil.com");
		expect(new URL(safeReturnTo("/.//evil.com"), ORIGIN).origin).toBe(ORIGIN);
	});

	it("only ever returns something that stays on this origin", () => {
		const hostile = [
			"//evil.com",
			"/\\evil.com",
			"/\t/evil.com",
			"/.//evil.com",
			`${ORIGIN}/app`,
			"javascript:alert(1)",
		];
		for (const returnTo of hostile) {
			expect(new URL(safeReturnTo(returnTo), ORIGIN).origin).toBe(ORIGIN);
		}
	});
});
