import { afterEach, describe, expect, it } from "vitest";
import { getRunsPerPrompt, MAX_PROMPTS, promptSaveDenial, RUNS_PER_PROMPT_FALLBACK } from "./constants";

const original = process.env.RUNS_PER_PROMPT;

afterEach(() => {
	if (original === undefined) delete process.env.RUNS_PER_PROMPT;
	else process.env.RUNS_PER_PROMPT = original;
});

function withEnv(value: string | undefined): number {
	if (value === undefined) delete process.env.RUNS_PER_PROMPT;
	else process.env.RUNS_PER_PROMPT = value;
	return getRunsPerPrompt();
}

/**
 * Replication multiplies provider spend one-for-one, so a bad value must not
 * quietly become a bigger bill than the operator asked for. Every rejection
 * below falls back to the default rather than to something larger.
 */
describe("getRunsPerPrompt", () => {
	it("keeps the long-standing default when unset", () => {
		expect(withEnv(undefined)).toBe(RUNS_PER_PROMPT_FALLBACK);
		expect(RUNS_PER_PROMPT_FALLBACK).toBe(5);
	});

	it("takes an operator's value", () => {
		expect(withEnv("1")).toBe(1);
		expect(withEnv("12")).toBe(12);
	});

	it("refuses a value that would run nothing", () => {
		// Zero would stop tracking altogether, which no one sets on purpose.
		expect(withEnv("0")).toBe(RUNS_PER_PROMPT_FALLBACK);
		expect(withEnv("-3")).toBe(RUNS_PER_PROMPT_FALLBACK);
	});

	it("refuses a fraction, since a run is not divisible", () => {
		expect(withEnv("2.5")).toBe(RUNS_PER_PROMPT_FALLBACK);
	});

	it("refuses junk and an empty value rather than reading them as zero", () => {
		expect(withEnv("lots")).toBe(RUNS_PER_PROMPT_FALLBACK);
		expect(withEnv("")).toBe(RUNS_PER_PROMPT_FALLBACK);
	});
});

/**
 * The prompt cap is deliberately one-sided: it stops a brand growing past
 * MAX_PROMPTS through the editor, but says nothing about a brand that is
 * already past it. The admin API adds prompts without consulting the cap (see
 * the entitlement guards for the plan limits that do apply there), so brands
 * over the line exist and must stay editable.
 */
describe("promptSaveDenial", () => {
	const save = (existing: number, adding: number, submitted = existing + adding) =>
		promptSaveDenial({ existing, adding, submitted });

	it("allows a save that stays within the cap", () => {
		expect(save(0, 1)).toBeNull();
		expect(save(MAX_PROMPTS - 1, 1)).toBeNull();
	});

	it("refuses a save that grows past the cap", () => {
		expect(save(MAX_PROMPTS, 1)).toMatch(new RegExp(`at most ${MAX_PROMPTS} prompts`));
		expect(save(MAX_PROMPTS - 1, 2)).not.toBeNull();
	});

	it("keeps an over-cap brand editable as long as the save adds nothing", () => {
		// What the admin API leaves behind: 150 prompts, no plan limit in the way.
		// Disabling one, or fixing a typo, submits all 150 and must go through.
		expect(save(150, 0)).toBeNull();
		expect(save(150, 1)).not.toBeNull();
	});

	it("refuses a list longer than the brand could account for", () => {
		// Padding with ids the brand does not have, which the cap alone would miss
		// once a brand is over the line.
		expect(save(150, 0, 500)).toMatch(/more prompts than this brand has/);
	});
});
