import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
	const constructorOptions = vi.fn();
	const info = vi.fn().mockResolvedValue({ status: "completed" });
	const items = vi.fn(async function* () {
		yield { retrieve_id: "retrieve-1" };
	});
	const retrieve = vi.fn().mockResolvedValue({ json_content: "not valid JSON" });

	return { constructorOptions, info, items, retrieve };
});

vi.mock("olostep", () => ({
	default: class Olostep {
		batches = { info: sdk.info, items: sdk.items };
		retrieve = sdk.retrieve;

		constructor(options: unknown) {
			sdk.constructorOptions(options);
		}
	},
}));

import { olostep } from "./olostep";

beforeEach(() => {
	vi.stubEnv("OLOSTEP_API_KEY", "test-key");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
});

describe("olostep provider", () => {
	it("bounds SDK calls and checkpoints retrieved content before parsing it", async () => {
		const checkpointRawResponse = vi.fn().mockResolvedValue(undefined);

		await expect(
			olostep.run("chatgpt", "best speakers", {
				externalTaskId: "batch-1",
				webSearch: true,
				checkpointRawResponse,
			}),
		).rejects.toThrow(SyntaxError);

		expect(sdk.constructorOptions).toHaveBeenCalledWith({
			apiKey: "test-key",
			timeoutMs: 30_000,
			retry: { maxRetries: 0, initialDelayMs: 2000 },
		});
		expect(checkpointRawResponse).toHaveBeenCalledWith({ rawOutput: "not valid JSON" });
	});
});
