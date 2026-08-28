import { describe, expect, it } from "vitest";
import { planPromptSave, type StoredPrompt, type SubmittedPrompt } from "@/server/prompt-save";

const CLOUD = { premiumMetered: true };
const SELF_HOSTED = { premiumMetered: false };

function stored(id: string, overrides: Partial<StoredPrompt> = {}): StoredPrompt {
	return { id, enabled: true, premiumModels: [], ...overrides };
}

function submitted(overrides: Partial<SubmittedPrompt> = {}): SubmittedPrompt {
	return { value: "how do i track brand mentions", enabled: true, ...overrides };
}

describe("which rows a save may claim", () => {
	it("updates the brand's own rows and inserts the ones with no id", () => {
		const plan = planPromptSave([submitted({ id: "own" }), submitted()], [stored("own")], CLOUD);

		expect(plan.updates.map((update) => update.id)).toEqual(["own"]);
		expect(plan.inserts).toHaveLength(1);
	});

	it("drops an id the brand does not own rather than writing it", () => {
		// The update is scoped by brand id too, so this would be a no-op write —
		// but it would still have been counted against the org's pools.
		const plan = planPromptSave([submitted({ id: "someone-elses" })], [stored("own")], CLOUD);

		expect(plan).toEqual({ updates: [], inserts: [] });
	});

	it("claims a repeated id once, so a padded list cannot inflate what the save is charged for", () => {
		const rows = Array.from({ length: 500 }, () => submitted({ id: "own", premiumModels: ["claude"] }));
		const plan = planPromptSave(rows, [stored("own")], CLOUD);

		expect(plan.updates).toHaveLength(1);
	});

	it("keeps the last-writer-wins ordering out of it by taking the first claim", () => {
		const plan = planPromptSave(
			[submitted({ id: "own", value: "first" }), submitted({ id: "own", value: "second" })],
			[stored("own")],
			CLOUD,
		);

		expect(plan.updates.map((update) => update.prompt.value)).toEqual(["first"]);
	});
});

describe("what grounded models a row ends up carrying", () => {
	it("takes the submitted picks where the pool meters them", () => {
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["claude"] })], [stored("own")], CLOUD);

		expect(plan.updates[0].after.premiumModels).toEqual(["claude"]);
	});

	it("ignores a model the premium tier does not sell", () => {
		// Perplexity is a platform pick, not a grounded pairing — an unknown entry
		// costs nothing rather than failing the whole save.
		const plan = planPromptSave([submitted({ premiumModels: ["perplexity", "claude"] })], [], CLOUD);

		expect(plan.inserts[0].after.premiumModels).toEqual(["claude"]);
	});

	it("refuses a row asked to carry a model it does not already carry", () => {
		// Self-hosted picks grounded targets per brand on the LLMs page; the run
		// policy never reads this column there, so the assignment is not the
		// editor's to make.
		const existing = [stored("own", { premiumModels: ["claude"] })];

		for (const models of [["grok"], ["claude", "grok"]]) {
			expect(() => planPromptSave([submitted({ id: "own", premiumModels: models })], existing, SELF_HOSTED)).toThrow(
				/pick them in LLM settings/,
			);
		}
		expect(() => planPromptSave([submitted({ premiumModels: ["claude"] })], [], SELF_HOSTED)).toThrow(
			/pick them in LLM settings/,
		);
	});

	it("lets a database moved off cloud carry its assignments back unchanged", () => {
		// The editor submits every row's stored models on every save, so this is
		// the ordinary case, not an edge one: refusing it would freeze the brand.
		const existing = [stored("own", { premiumModels: ["claude"] })];
		const plan = planPromptSave(
			[submitted({ id: "own", value: "fixed typo", premiumModels: ["claude"] })],
			existing,
			SELF_HOSTED,
		);

		expect(plan.updates[0].after).toEqual({ enabled: true, premiumModels: ["claude"] });
	});

	it("lets go of an assignment, which is how the editor deletes a grounded prompt", () => {
		// A deleted row is submitted disabled with its models cleared. Releasing
		// what the deployment could not run anyway costs nobody anything.
		const existing = [stored("own", { premiumModels: ["claude"] })];
		const plan = planPromptSave([submitted({ id: "own", enabled: false, premiumModels: [] })], existing, SELF_HOSTED);

		expect(plan.updates[0].after).toEqual({ enabled: false, premiumModels: [] });
	});

	it("does not let a model the premium tier stopped selling block the save", () => {
		// Dropping a model from PREMIUM_MODELS leaves rows carrying it. The save
		// normalises it away, the same as in cloud, rather than reading it as an
		// assignment the deployment is refusing.
		const existing = [stored("own", { premiumModels: ["retired-model"] })];
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["retired-model"] })], existing, SELF_HOSTED);

		expect(plan.updates[0].after.premiumModels).toEqual([]);
	});

	it("carries a disabled row's assignment through untouched", () => {
		// Disabled spends nothing, so there is nothing to release — and the save
		// must not quietly clear what re-enabling would restore.
		const existing = [stored("own", { enabled: false, premiumModels: ["claude"] })];
		const plan = planPromptSave(
			[submitted({ id: "own", enabled: false, premiumModels: ["claude"] })],
			existing,
			SELF_HOSTED,
		);

		expect(plan.updates[0].after).toEqual({ enabled: false, premiumModels: ["claude"] });
	});
});

describe("the plan prices the save", () => {
	it("reports each update's before, so a save that changes nothing costs nothing", () => {
		const existing = [stored("own", { premiumModels: ["claude"] })];
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["claude"] })], existing, CLOUD);

		expect(plan.updates[0].before).toEqual(existing[0]);
		expect(plan.updates[0].after).toEqual({ enabled: true, premiumModels: ["claude"] });
	});

	it("leaves an insert with no before", () => {
		const plan = planPromptSave([submitted()], [], CLOUD);

		expect(plan.inserts[0]).not.toHaveProperty("before");
	});
});
