import { afterEach, describe, expect, it, vi } from "vitest";
import { readinessResponse } from "@/lib/readiness";

describe("readinessResponse", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reports ready when the database answers", async () => {
		const response = await readinessResponse(async () => [{ "?column?": 1 }]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=10, s-maxage=10");
	});

	it("reports unavailable without leaking the error when the database is unreachable", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await readinessResponse(async () => {
			throw new Error('password authentication failed for user "postgres"');
		});

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: "unavailable" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("reports unavailable instead of hanging when the database never answers", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await readinessResponse(() => new Promise(() => {}), 50);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: "unavailable" });
	});
});
