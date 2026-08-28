import { UNLIMITED_ENTITLEMENTS } from "@workspace/config/entitlements";
import { decideGroundedAssign, promptSaveDelta } from "@workspace/lib/entitlements";
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

	it("drops an id the brand does not own rather than writing it", () => {
		// The update is scoped by brand id too, so this would be a no-op write —
		// but it would still have been counted against the org's pools.
		const plan = planPromptSave([submitted({ id: "someone-elses" })], [stored("own")]);

		expect(plan).toEqual({ updates: [], inserts: [] });
	});

	it("claims a repeated id once, so a padded list cannot inflate what the save is charged for", () => {
		const rows = Array.from({ length: 500 }, () => submitted({ id: "own", premiumModels: ["claude"] }));
		const plan = planPromptSave(rows, [stored("own")]);

		expect(plan.updates).toHaveLength(1);
	});

	it("keeps the last-writer-wins ordering out of it by taking the first claim", () => {
		const plan = planPromptSave(
			[submitted({ id: "own", value: "first" }), submitted({ id: "own", value: "second" })],
			[stored("own")],
		);

		expect(plan.updates.map((update) => update.prompt.value)).toEqual(["first"]);
	});
});

describe("what grounded models a row ends up carrying", () => {
	it("takes the submitted picks", () => {
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["claude"] })], [stored("own")]);

		expect(plan.updates[0].after.premiumModels).toEqual(["claude"]);
	});

	it("ignores a model the premium tier does not sell", () => {
		// Perplexity is a platform pick, not a grounded pairing — an unknown entry
		// costs nothing rather than failing the whole save.
		const plan = planPromptSave([submitted({ premiumModels: ["perplexity", "claude"] })], []);

		expect(plan.inserts[0].after.premiumModels).toEqual(["claude"]);
	});

	it("normalises away a model the premium tier stopped selling", () => {
		// Dropping a model from PREMIUM_MODELS leaves rows carrying it. Both sides
		// of the comparison go through the same filter, so the guards read this as
		// releasing an assignment rather than taking one on.
		const existing = [stored("own", { premiumModels: ["retired-model"] })];
		const plan = planPromptSave([submitted({ id: "own", premiumModels: ["retired-model"] })], existing);

		expect(plan.updates[0].after.premiumModels).toEqual([]);
	});

	it("carries a disabled row's assignment through untouched", () => {
		// Disabled spends nothing, so there is nothing to release — and the save
		// must not quietly clear what re-enabling would restore.
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

/**
 * The plan is only half the answer: what a save is allowed to do is decided by
 * handing it to the entitlement guards. These pin the round trip for the cases a
 * deployment with no premium pool runs into, which is where getting it wrong
 * freezes a brand rather than merely miscounting one.
 */
describe("a save with no premium pool, planned and then judged", () => {
	const verdict = (submitted: SubmittedPrompt[], existing: StoredPrompt[]) => {
		const { updates, inserts } = planPromptSave(submitted, existing);
		return decideGroundedAssign(UNLIMITED_ENTITLEMENTS, promptSaveDelta([...updates, ...inserts]).premiumAdded);
	};
	const groundedRow = [stored("own", { premiumModels: ["claude"] })];

	it("refuses a row asked to carry a model it does not already carry", () => {
		// Self-hosted picks grounded targets per brand on the LLMs page; the run
		// policy never reads this column there, so the assignment is not the
		// editor's to make.
		expect(verdict([submitted({ id: "own", premiumModels: ["grok"] })], groundedRow).allowed).toBe(false);
		expect(verdict([submitted({ id: "own", premiumModels: ["claude", "grok"] })], groundedRow).allowed).toBe(false);
		expect(verdict([submitted({ premiumModels: ["claude"] })], []).allowed).toBe(false);
	});

	it("lets a database moved off cloud carry its assignments back unchanged", () => {
		// The editor submits every row's stored models on every save, so this is
		// the ordinary case, not an edge one: refusing it would freeze the brand.
		expect(
			verdict([submitted({ id: "own", value: "fixed typo", premiumModels: ["claude"] })], groundedRow).allowed,
		).toBe(true);
	});

	it("lets go of an assignment, which is how the editor deletes a grounded prompt", () => {
		// A deleted row is submitted disabled with its models cleared. Releasing
		// what the deployment could not run anyway costs nobody anything.
		expect(verdict([submitted({ id: "own", enabled: false, premiumModels: [] })], groundedRow).allowed).toBe(true);
	});

	it("does not let a model the premium tier stopped selling block the save", () => {
		// Dropping a model from PREMIUM_MODELS leaves rows carrying it. Both sides
		// normalise it away rather than reading it as an assignment being made.
		const retired = [stored("own", { premiumModels: ["retired-model"] })];
		expect(verdict([submitted({ id: "own", premiumModels: ["retired-model"] })], retired).allowed).toBe(true);
	});
});
