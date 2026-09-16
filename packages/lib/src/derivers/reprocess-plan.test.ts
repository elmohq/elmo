import { describe, expect, it } from "vitest";
import { planRowWork } from "./reprocess-plan";
import type { Deriver } from "./types";

const textDeriver: Deriver = {
	name: "text-deriver",
	version: 1,
	needs: "text",
	fingerprint: () => "",
	derive: () => ({}),
};

const rawDeriver: Deriver = {
	name: "raw-deriver",
	version: 1,
	needs: "raw",
	fingerprint: () => "",
	derive: () => ({}),
};

describe("planRowWork", () => {
	it("needs extraction when requested and the stored version is behind", () => {
		const plan = planRowWork({ extractorVersion: 1, textContent: "hi" }, true, 2, []);
		expect(plan.needsExtraction).toBe(true);
		expect(plan.needsRaw).toBe(true);
	});

	it("does not need extraction when the stored version already matches", () => {
		const plan = planRowWork({ extractorVersion: 2, textContent: "hi" }, true, 2, []);
		expect(plan.needsExtraction).toBe(false);
	});

	it("never needs extraction when the extraction layer was not requested, even if stale", () => {
		const plan = planRowWork({ extractorVersion: 1, textContent: "hi" }, false, 2, []);
		expect(plan.needsExtraction).toBe(false);
		expect(plan.needsRaw).toBe(false);
	});

	it("needs raw when a stale deriver reads raw output directly", () => {
		const plan = planRowWork({ extractorVersion: 2, textContent: "hi" }, false, 2, [rawDeriver]);
		expect(plan.needsExtraction).toBe(false);
		expect(plan.needsRaw).toBe(true);
	});

	it("does not need raw for a stale text deriver when text_content is already filled", () => {
		const plan = planRowWork({ extractorVersion: 2, textContent: "hi" }, false, 2, [textDeriver]);
		expect(plan.needsRaw).toBe(false);
	});

	it("needs raw for a stale text deriver when text_content is missing, so it can be filled lazily", () => {
		const plan = planRowWork({ extractorVersion: 2, textContent: null }, false, 2, [textDeriver]);
		expect(plan.needsRaw).toBe(true);
	});

	it("needs nothing when extraction is current and no deriver is stale", () => {
		const plan = planRowWork({ extractorVersion: 2, textContent: "hi" }, true, 2, []);
		expect(plan.needsExtraction).toBe(false);
		expect(plan.needsRaw).toBe(false);
	});
});
