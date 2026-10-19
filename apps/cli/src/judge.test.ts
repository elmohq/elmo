import { beforeEach, describe, expect, it, vi } from "vitest";

let answer: string | undefined;
let validate: ((value: string | undefined) => string | undefined) | undefined;

vi.mock("@clack/prompts", () => ({
	note: () => undefined,
	password: async (options: { validate: typeof validate }) => {
		validate = options.validate;
		return answer;
	},
	isCancel: () => false,
	cancel: () => undefined,
}));

const { collectJudgeKey } = await import("./judge.js");

describe("collectJudgeKey", () => {
	beforeEach(() => {
		answer = undefined;
		validate = undefined;
	});

	it("requires a TypeSafe key when there's no OpenRouter key to call Jev with", async () => {
		answer = " ts-key ";
		const env: Record<string, string> = {};
		await collectJudgeKey(env);
		expect(env.TYPESAFE_API_KEY).toBe("ts-key");
		expect(validate?.("")).toBe("Required");
	});

	it("lets an OpenRouter user leave the TypeSafe key empty", async () => {
		answer = "";
		const env: Record<string, string> = { OPENROUTER_API_KEY: "or-key" };
		await collectJudgeKey(env);
		expect(validate?.("")).toBeUndefined();
		expect(env).toEqual({ OPENROUTER_API_KEY: "or-key" });
	});

	it("still takes a TypeSafe key from an OpenRouter user", async () => {
		answer = "ts-key";
		const env: Record<string, string> = { OPENROUTER_API_KEY: "or-key" };
		await collectJudgeKey(env);
		expect(env.TYPESAFE_API_KEY).toBe("ts-key");
	});
});
