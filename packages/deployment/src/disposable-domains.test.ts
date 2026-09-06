import { describe, expect, it } from "vitest";
import { isDisposableEmail } from "./disposable-domains";

describe("isDisposableEmail", () => {
	it("flags a known disposable domain", () => {
		expect(isDisposableEmail("user@mailinator.com")).toBe(true);
	});

	it("allows a regular provider", () => {
		expect(isDisposableEmail("user@gmail.com")).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(isDisposableEmail("USER@MAILINATOR.COM")).toBe(true);
	});

	it("returns false for a string with no @", () => {
		expect(isDisposableEmail("not-an-email")).toBe(false);
	});
});
