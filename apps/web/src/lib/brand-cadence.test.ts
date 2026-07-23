import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { mergeCadenceRows } from "./brand-cadence";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("mergeCadenceRows", () => {
	it("prefers the brand row over org and instance rows", () => {
		expect(
			mergeCadenceRows([
				{ scope: "instance", value: 24 },
				{ scope: "organization", value: 12 },
				{ scope: "brand", value: 6 },
			]),
		).toBe(6);
	});

	it("falls back org → instance when narrower scopes are absent", () => {
		expect(
			mergeCadenceRows([
				{ scope: "instance", value: 24 },
				{ scope: "organization", value: 12 },
			]),
		).toBe(12);
		expect(mergeCadenceRows([{ scope: "instance", value: 24 }])).toBe(24);
	});

	it("skips values that fail the registry schema (jsonb drift is fail-safe)", () => {
		expect(
			mergeCadenceRows([
				{ scope: "instance", value: 48 },
				{ scope: "brand", value: "not-a-number" },
			]),
		).toBe(48);
		expect(mergeCadenceRows([{ scope: "brand", value: -3 }])).toBe(getDefaultDelayHours());
	});

	it("uses the env-aware default when no row exists (pre-import parity)", () => {
		vi.stubEnv("DEFAULT_DELAY_HOURS", "7");
		expect(mergeCadenceRows([])).toBe(7);
	});

	it("ignores rows at unknown scopes", () => {
		expect(mergeCadenceRows([{ scope: "prompt", value: 1 }])).toBe(getDefaultDelayHours());
	});
});
