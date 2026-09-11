/**
 * The window between a committed write and the queue calls that follow it. A
 * failure there is not a failed write, and answering it as one gets the batch
 * created twice by whatever retries — agents on the MCP tools especially.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scheduler = vi.hoisted(() => ({
	createPromptJobScheduler: vi.fn(async (_promptId: string) => true),
	removePromptJobScheduler: vi.fn(async (_promptId: string) => true),
}));
vi.mock("@/lib/job-scheduler", () => scheduler);

/** Enough of drizzle for the insert createPrompts makes under the quota lock. */
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		transaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
			fn({
				execute: async () => undefined,
				insert: () => ({
					values: (values: Record<string, unknown>[]) => ({
						returning: async () => values.map((value, index) => ({ ...value, id: `prompt_${index + 1}` })),
					}),
				}),
			}),
	},
}));

const { createPrompts } = await import("@/server/prompts-core");

const BRAND = { id: "brand_1", name: "Elmo", website: "https://elmo.chat", organizationId: "org_1" };

const TWO_PROMPTS = {
	prompts: [{ value: "best ai visibility tool" }, { value: "how do i track brand mentions" }],
};

beforeEach(() => {
	// Local mode resolves to unlimited entitlements without reading a row, so the
	// quota check in front of the insert needs no billing fixtures.
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	scheduler.createPromptJobScheduler.mockClear();
	scheduler.createPromptJobScheduler.mockImplementation(async () => true);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("createPrompts", () => {
	it("schedules every enabled prompt once the write has committed", async () => {
		const created = await createPrompts(BRAND, TWO_PROMPTS);

		expect(created.map((prompt) => prompt.id)).toEqual(["prompt_1", "prompt_2"]);
		expect(scheduler.createPromptJobScheduler.mock.calls).toEqual([["prompt_1"], ["prompt_2"]]);
	});

	it("leaves a disabled prompt unscheduled", async () => {
		await createPrompts(BRAND, {
			prompts: [{ value: "tracked" }, { value: "parked", enabled: false }],
		});

		expect(scheduler.createPromptJobScheduler.mock.calls).toEqual([["prompt_1"]]);
	});

	it("returns the created prompts when the queue is unreachable", async () => {
		scheduler.createPromptJobScheduler.mockRejectedValue(new Error("queue unreachable"));

		const created = await createPrompts(BRAND, TWO_PROMPTS);

		expect(created.map((prompt) => prompt.value)).toEqual(["best ai visibility tool", "how do i track brand mentions"]);
	});

	it("still schedules the rest of a batch when one prompt cannot be scheduled", async () => {
		scheduler.createPromptJobScheduler.mockImplementation(async (promptId: string) => {
			if (promptId === "prompt_1") throw new Error("queue unreachable");
			return true;
		});

		await createPrompts(BRAND, TWO_PROMPTS);

		expect(scheduler.createPromptJobScheduler).toHaveBeenCalledWith("prompt_2");
	});
});
