import { describe, expect, it } from "vitest";
import { normalizeStoredProviderPayload, validateProviderResult } from "./provider-payload";

describe("durable provider payload normalization", () => {
	it("strictly replays a checkpointed JSON response without another provider call", () => {
		const rawOutput = JSON.stringify({
			choices: [{ message: { content: "durable answer", annotations: [] } }],
		});

		expect(normalizeStoredProviderPayload("openrouter", { rawResponseOnly: true, rawOutput })).toMatchObject({
			rawOutput,
			textContent: "durable answer",
		});
	});

	it("replays BrightData overview JSON checkpointed as response text", () => {
		const rawOutput = JSON.stringify({
			type: "computer_initialize_state",
			text: "durable overview answer",
		});
		const normalized = normalizeStoredProviderPayload("brightdata", { rawResponseOnly: true, rawOutput });
		expect(normalized.rawOutput).toBe(rawOutput);
		expect(normalized.textContent).toContain("durable overview answer");
	});

	it("rejects malformed paid JSON instead of storing an extraction-error success", () => {
		expect(() =>
			normalizeStoredProviderPayload("olostep", {
				rawResponseOnly: true,
				rawOutput: "not JSON",
			}),
		).toThrow("malformed JSON");
	});

	it("rejects display-oriented extraction failure sentinels", () => {
		expect(() =>
			validateProviderResult({
				rawOutput: {},
				textContent: "Error extracting text content.",
				webQueries: [],
				citations: [],
			}),
		).toThrow("could not be normalized safely");
	});
});
