import { beforeEach, describe, expect, it, vi } from "vitest";

const answers: unknown[] = [];
const asked: { kind: string; message: string }[] = [];

function record(kind: string) {
	return async (options: { message: string }) => {
		asked.push({ kind, message: options.message });
		return answers.shift();
	};
}

vi.mock("@clack/prompts", () => ({
	confirm: record("confirm"),
	password: record("password"),
	text: record("text"),
	multiselect: record("multiselect"),
	isCancel: () => false,
	cancel: () => undefined,
	log: { info: () => undefined, warn: () => undefined, step: () => undefined },
}));

const { collectProvider, providerSpec } = await import("./providers.js");

describe("collectProvider", () => {
	beforeEach(() => {
		answers.length = 0;
		asked.length = 0;
	});

	it("skips a provider the user declines", async () => {
		answers.push(false);
		const env: Record<string, string> = {};
		const targets: string[] = [];

		await collectProvider(providerSpec("anthropic"), env, targets);

		expect(env).toEqual({});
		expect(targets).toEqual([]);
		expect(asked).toHaveLength(1);
	});

	it("collects a direct API key, model slug, and web-search choice", async () => {
		answers.push(true, "sk-ant-123", "claude-opus-5", false);
		const env: Record<string, string> = {};
		const targets: string[] = [];

		await collectProvider(providerSpec("anthropic"), env, targets);

		expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-123" });
		expect(targets).toEqual(["claude:anthropic-api:claude-opus-5"]);
		expect(asked.map((a) => a.kind)).toEqual(["confirm", "password", "text", "confirm"]);
	});

	it("falls back to the default model when the slug is left blank", async () => {
		answers.push(true, "sk-ant-123", "", true);

		const targets: string[] = [];
		await collectProvider(providerSpec("anthropic"), {}, targets);

		expect(targets).toEqual(["claude:anthropic-api:claude-sonnet-5:online"]);
	});

	it("collects both scraper credentials and the picked surfaces", async () => {
		answers.push(true, "user@example.com", "hunter2", ["chatgpt:oxylabs:online", "perplexity:oxylabs:online"]);
		const env: Record<string, string> = {};
		const targets: string[] = [];

		await collectProvider(providerSpec("oxylabs"), env, targets);

		expect(env).toEqual({ OXYLABS_USERNAME: "user@example.com", OXYLABS_PASSWORD: "hunter2" });
		expect(targets).toEqual(["chatgpt:oxylabs:online", "perplexity:oxylabs:online"]);
		expect(asked.map((a) => a.kind)).toEqual(["confirm", "text", "password", "multiselect"]);
		expect(asked.at(-1)?.message).toBe("LLM Providers to track via Oxylabs");
	});
});
