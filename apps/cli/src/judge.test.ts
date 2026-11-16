import { beforeEach, describe, expect, it, vi } from "vitest";

const answers: unknown[] = [];
const defaults: unknown[] = [];

vi.mock("@clack/prompts", () => ({
	note: () => undefined,
	select: async (options: { initialValue: unknown }) => {
		defaults.push(options.initialValue);
		return answers.shift();
	},
	password: async () => answers.shift(),
	isCancel: () => false,
	cancel: () => undefined,
	log: { info: () => undefined },
}));

const { collectJudgeKey } = await import("./judge.js");

describe("collectJudgeKey", () => {
	beforeEach(() => {
		answers.length = 0;
		defaults.length = 0;
	});

	it("offers the OpenRouter key already entered, and asks for nothing more when it's chosen", async () => {
		answers.push("openrouter");
		const env: Record<string, string> = { OPENROUTER_API_KEY: "or-key" };
		await collectJudgeKey(env);
		expect(defaults[0]).toBe("openrouter");
		expect(answers).toEqual([]);
		expect(env).toEqual({ OPENROUTER_API_KEY: "or-key" });
	});

	it("takes a TypeSafe key from someone who has OpenRouter but wants TypeSafe directly", async () => {
		answers.push("typesafe", " ts-key ");
		const env: Record<string, string> = { OPENROUTER_API_KEY: "or-key" };
		await collectJudgeKey(env);
		expect(env).toEqual({ OPENROUTER_API_KEY: "or-key", TYPESAFE_API_KEY: "ts-key" });
	});

	it("defaults to TypeSafe without an OpenRouter key", async () => {
		answers.push("typesafe", "ts-key");
		const env: Record<string, string> = { ANTHROPIC_API_KEY: "sk-ant" };
		await collectJudgeKey(env);
		expect(defaults[0]).toBe("typesafe");
		expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant", TYPESAFE_API_KEY: "ts-key" });
	});

	it("adds an OpenRouter key for Jev without moving onboarding off the provider chosen for it", async () => {
		answers.push("openrouter", "or-key");
		const env: Record<string, string> = { ANTHROPIC_API_KEY: "sk-ant" };
		await collectJudgeKey(env);
		expect(env).toEqual({
			ANTHROPIC_API_KEY: "sk-ant",
			OPENROUTER_API_KEY: "or-key",
			ONBOARDING_LLM_TARGET: "claude:anthropic-api",
		});
	});

	it("leaves onboarding alone when OpenAI already outranks OpenRouter for it", async () => {
		answers.push("openrouter", "or-key");
		const env: Record<string, string> = { OPENAI_API_KEY: "sk-oai", MISTRAL_API_KEY: "mi" };
		await collectJudgeKey(env);
		expect(env.ONBOARDING_LLM_TARGET).toBeUndefined();
	});
});
