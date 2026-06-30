import { describe, it, expect, afterEach } from "vitest";
import { getMaxPrompts, MAX_PROMPTS } from "./constants";

describe("getMaxPrompts", () => {
	const original = process.env.MAX_PROMPTS_PER_BRAND;
	afterEach(() => {
		if (original === undefined) delete process.env.MAX_PROMPTS_PER_BRAND;
		else process.env.MAX_PROMPTS_PER_BRAND = original;
	});

	it("defaults to MAX_PROMPTS when the env var is unset", () => {
		delete process.env.MAX_PROMPTS_PER_BRAND;
		expect(getMaxPrompts()).toBe(MAX_PROMPTS);
	});

	it("uses a valid positive override", () => {
		process.env.MAX_PROMPTS_PER_BRAND = "250";
		expect(getMaxPrompts()).toBe(250);
	});

	it.each(["0", "-5", "abc", ""])(
		"falls back to MAX_PROMPTS for the invalid value %j",
		(value) => {
			process.env.MAX_PROMPTS_PER_BRAND = value;
			expect(getMaxPrompts()).toBe(MAX_PROMPTS);
		},
	);
});
