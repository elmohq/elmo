import { describe, expect, it } from "vitest";
import { calculateEnabledPromptTotal, InvalidPromptMutationError } from "./prompt-mutations";

describe("calculateEnabledPromptTotal", () => {
	it("counts inserts and activation changes against the organization total", () => {
		expect(
			calculateEnabledPromptTotal({
				currentOrganizationEnabled: 10,
				existingEnabledById: new Map([
					["enabled", true],
					["disabled", false],
				]),
				mutations: [
					{ id: "enabled", value: "one", enabled: false, tags: [] },
					{ id: "disabled", value: "two", enabled: true, tags: [] },
					{ value: "three", enabled: true, tags: [] },
					{ value: "four", enabled: false, tags: [] },
				],
			}),
		).toBe(11);
	});

	it("rejects updates outside the requested brand", () => {
		expect(() =>
			calculateEnabledPromptTotal({
				currentOrganizationEnabled: 0,
				existingEnabledById: new Map(),
				mutations: [{ id: "other-brand", value: "one", enabled: true, tags: [] }],
			}),
		).toThrow(InvalidPromptMutationError);
	});
});
