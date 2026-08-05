import { afterEach, describe, expect, it, vi } from "vitest";

const olostepClient = vi.hoisted(() => ({
	constructorOptions: vi.fn(),
	create: vi.fn(),
	retrieve: vi.fn(),
}));

vi.mock("olostep", () => ({
	default: class {
		constructor(options: unknown) {
			olostepClient.constructorOptions(options);
		}
		batches = { create: olostepClient.create };
		retrieve = olostepClient.retrieve;
	},
}));

import { olostep } from "./olostep";

afterEach(() => {
	vi.clearAllMocks();
});

function successfulBatch() {
	olostepClient.create.mockResolvedValue({
		waitTillDone: vi.fn(),
		async *items() {
			yield { retrieve_id: "retrieve-123" };
		},
	});
	olostepClient.retrieve.mockResolvedValue({ json_content: { answer: "answer", citations: [] } });
}

describe("olostep SDK retries", () => {
	it("uses zero SDK retries for a durable cloud attempt", async () => {
		successfulBatch();
		await olostep.run("chatgpt", "prompt", { webSearch: true, maxRetries: 0 });
		expect(olostepClient.constructorOptions).toHaveBeenCalledWith(
			expect.objectContaining({ retry: expect.objectContaining({ maxRetries: 0 }) }),
		);
	});

	it("preserves the legacy three-retry default", async () => {
		successfulBatch();
		await olostep.run("chatgpt", "prompt", { webSearch: true });
		expect(olostepClient.constructorOptions).toHaveBeenCalledWith(
			expect.objectContaining({ retry: expect.objectContaining({ maxRetries: 3 }) }),
		);
	});
});
