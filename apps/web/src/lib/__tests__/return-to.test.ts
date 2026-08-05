import { describe, expect, it } from "vitest";
import { isSafeRelativePath, safeReturnTo } from "../return-to";

describe("safeReturnTo", () => {
	it("accepts only application-relative paths without browser globals", () => {
		expect(safeReturnTo("/app/new?organization=one#setup")).toBe("/app/new?organization=one#setup");
		expect(safeReturnTo("//attacker.example/path")).toBe("/app");
		expect(safeReturnTo("/\\attacker.example/path")).toBe("/app");
		expect(safeReturnTo("/\n/attacker.example/path")).toBe("/app");
		expect(safeReturnTo("https://attacker.example/path")).toBe("/app");
		expect(safeReturnTo("https://app.example.test/app")).toBe("/app");
		expect(safeReturnTo(undefined)).toBe("/app");
	});

	it("exposes the same predicate used by server-side return URL validators", () => {
		expect(isSafeRelativePath("/app/workspaces/org-a/billing")).toBe(true);
		expect(isSafeRelativePath("/\\attacker.example/path")).toBe(false);
		expect(isSafeRelativePath("/\t/attacker.example/path")).toBe(false);
	});
});
