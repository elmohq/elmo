import { describe, expect, it } from "vitest";
import { shouldUseLegacyScheduler } from "./legacy-rollout";

describe("legacy scheduler rollout ownership", () => {
	it.each(["local", "demo", "whitelabel"] as const)("preserves %s scheduling for every rollout value", (mode) => {
		for (const rollout of [null, "legacy", "shadow", "v2"] as const) {
			expect(shouldUseLegacyScheduler(mode, rollout)).toBe(true);
		}
	});

	it("keeps missing, legacy, and shadow cloud brands on the migration-safe legacy path", () => {
		expect(shouldUseLegacyScheduler("cloud", null)).toBe(true);
		expect(shouldUseLegacyScheduler("cloud", "legacy")).toBe(true);
		expect(shouldUseLegacyScheduler("cloud", "shadow")).toBe(true);
	});

	it("excludes only explicit v2 cloud brands from legacy execution", () => {
		expect(shouldUseLegacyScheduler("cloud", "v2")).toBe(false);
	});
});
