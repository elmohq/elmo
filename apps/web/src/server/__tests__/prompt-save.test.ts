import { describe, expect, it } from "vitest";
import { planPromptSave, type StoredPrompt, type SubmittedPrompt } from "@/server/prompt-save";

function stored(id: string, overrides: Partial<StoredPrompt> = {}): StoredPrompt {
	return { id, enabled: true, premiumModels: [], ...overrides };
}

function submitted(overrides: Partial<SubmittedPrompt> = {}): SubmittedPrompt {
	return { value: "how do i track brand mentions", enabled: true, ...overrides };
}

describe("which rows a save may claim", () => {
	it("updates the brand's own rows and inserts the ones with no id", () => {
		const plan = planPromptSave([submitted({ id: "own" }), submitted()], [stored("own")]);

		expect(plan.updates.map((update) => update.id)).toEqual(["own"]);
		expect(plan.inserts).toHaveLength(1);
	});

	it("refuses an id the brand does not have", () => {
		// Another brand's prompt, or one deleted through the admin API since the
		// editor loaded. Skipping it would drop that edit and report success.
		expect(() => planPromptSave([submitted({ id: "someone-elses" })], [stored("own")])).toThrow(
			/not in this brand's list/,
		);
	});

	it("refuses the same id twice, rather than guessing which edit was meant", () => {
		expect(() =>
			planPromptSave(
				[submitted({ id: "own", value: "first" }), submitted({ id: "own", value: "second" })],
				[stored("own")],
			),
		).toThrow(/appears twice/);
	});

	it("refuses a padded list before it can be charged to the org's pools", () => {
		const rows = Array.from({ length: 500 }, () => submitted({ id: "own", premiumModels: ["claude"] }));

		expect(() => planPromptSave(rows, [stored("own")])).toThrow(/appears twice/);
	});
});

describe("what grounded models a row ends up carrying", () => {
	it("takes the submitted picks", () => {
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["claude"] })], [stored("own")]);

		expect(plan.updates[0].after.premiumModels).toEqual(["claude"]);
	});

	it("ignores a model the premium tier does not sell", () => {
		const plan = planPromptSave([submitted({ premiumModels: ["perplexity", "claude"] })], []);

		expect(plan.inserts[0].after.premiumModels).toEqual(["claude"]);
	});

	it("normalises away a model the premium tier stopped selling", () => {
		const existing = [stored("own", { premiumModels: ["retired-model"] })];
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["retired-model"] })], existing);

		expect(plan.updates[0].after.premiumModels).toEqual([]);
	});

	it("carries a disabled row's assignment through untouched", () => {
		const existing = [stored("own", { enabled: false, premiumModels: ["claude"] })];
		const plan = planPromptSave([submitted({ id: "own", enabled: false, premiumModels: ["claude"] })], existing);

		expect(plan.updates[0].after).toEqual({ enabled: false, premiumModels: ["claude"] });
	});
});

describe("the plan prices the save", () => {
	it("reports each update's before, so a save that changes nothing costs nothing", () => {
		const existing = [stored("own", { premiumModels: ["claude"] })];
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["claude"] })], existing);

		expect(plan.updates[0].before).toEqual(existing[0]);
		expect(plan.updates[0].after).toEqual({ enabled: true, premiumModels: ["claude"] });
	});

	it("leaves an insert with no before", () => {
		const plan = planPromptSave([submitted()], []);

		expect(plan.inserts[0]).not.toHaveProperty("before");
	});
});
