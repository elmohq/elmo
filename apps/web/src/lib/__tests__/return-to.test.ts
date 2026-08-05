import { describe, expect, it } from "vitest";
import { safeReturnTo } from "../return-to";

describe("safeReturnTo", () => {
	it("accepts only application-relative paths without browser globals", () => {
		expect(safeReturnTo("/app/new?organization=one#setup")).toBe("/app/new?organization=one#setup");
		expect(safeReturnTo("//attacker.example/path")).toBe("/app");
		expect(safeReturnTo("https://attacker.example/path")).toBe("/app");
		expect(safeReturnTo("https://app.example.test/app")).toBe("/app");
		expect(safeReturnTo(undefined)).toBe("/app");
	});
});
