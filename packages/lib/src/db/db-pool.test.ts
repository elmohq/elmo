import { describe, expect, it, vi } from "vitest";

vi.mock("pg", () => ({ default: { Pool: class {} } }));

const { databasePoolMax } = await import("./db");

describe("databasePoolMax", () => {
	it("defaults to 10 connections", () => {
		expect(databasePoolMax({})).toBe(10);
		expect(databasePoolMax({ DATABASE_POOL_MAX: " " })).toBe(10);
	});

	it("uses the configured size", () => {
		expect(databasePoolMax({ DATABASE_POOL_MAX: "3" })).toBe(3);
	});

	it.each(["0", "-1", "2.5", "many"])("rejects %s", (value) => {
		expect(() => databasePoolMax({ DATABASE_POOL_MAX: value })).toThrow("DATABASE_POOL_MAX");
	});
});
