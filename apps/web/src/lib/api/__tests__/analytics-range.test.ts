import { describe, expect, it } from "vitest";
import { parseDateRange } from "../analytics-range";
import { ApiError } from "../handler";

function params(q: Record<string, string>): URLSearchParams {
	return new URLSearchParams(q);
}

describe("parseDateRange", () => {
	it("parses valid from/to with a default UTC timezone", () => {
		expect(parseDateRange(params({ from: "2026-06-01", to: "2026-06-30" }))).toEqual({
			from: "2026-06-01",
			to: "2026-06-30",
			timezone: "UTC",
		});
	});

	it("keeps an explicit timezone", () => {
		expect(parseDateRange(params({ from: "2026-06-01", to: "2026-06-30", timezone: "America/New_York" }))).toEqual({
			from: "2026-06-01",
			to: "2026-06-30",
			timezone: "America/New_York",
		});
	});

	it("allows an equal from and to (single day)", () => {
		const r = parseDateRange(params({ from: "2026-06-01", to: "2026-06-01" }));
		expect(r.from).toBe("2026-06-01");
		expect(r.to).toBe("2026-06-01");
	});

	it("throws 400 when from or to is missing", () => {
		const cases: Record<string, string>[] = [{}, { from: "2026-06-01" }, { to: "2026-06-30" }];
		for (const q of cases) {
			try {
				parseDateRange(params(q));
				throw new Error("expected parseDateRange to throw");
			} catch (err) {
				expect(err).toBeInstanceOf(ApiError);
				expect((err as ApiError).status).toBe(400);
				expect((err as ApiError).message).toMatch(/from and to query parameters are required/);
			}
		}
	});

	it("throws 400 for a malformed date", () => {
		for (const q of [
			{ from: "2026-6-1", to: "2026-06-30" },
			{ from: "2026-06-01", to: "06/30/2026" },
			{ from: "2026-13-01", to: "2026-06-30" },
			{ from: "not-a-date", to: "2026-06-30" },
		]) {
			try {
				parseDateRange(params(q));
				throw new Error("expected parseDateRange to throw");
			} catch (err) {
				expect(err).toBeInstanceOf(ApiError);
				expect((err as ApiError).status).toBe(400);
				expect((err as ApiError).message).toMatch(/valid dates in YYYY-MM-DD/);
			}
		}
	});

	it("throws 400 when from is after to", () => {
		try {
			parseDateRange(params({ from: "2026-06-30", to: "2026-06-01" }));
			throw new Error("expected parseDateRange to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			expect((err as ApiError).status).toBe(400);
			expect((err as ApiError).message).toMatch(/from must be before or equal to to/);
		}
	});
});
