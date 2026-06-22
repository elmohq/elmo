import { afterEach, describe, expect, it, vi } from "vitest";

const dataforseoClient = vi.hoisted(() => ({
	chatgptLlmResponsesLive: vi.fn(),
	perplexityLlmResponsesLive: vi.fn(),
	geminiLlmResponsesLive: vi.fn(),
	googleAiModeLiveAdvanced: vi.fn(),
}));

vi.mock("dataforseo-client", () => ({
	AiOptimizationApi: class {
		chatGptLlmResponsesLive = dataforseoClient.chatgptLlmResponsesLive;
		perplexityLlmResponsesLive = dataforseoClient.perplexityLlmResponsesLive;
		geminiLlmResponsesLive = dataforseoClient.geminiLlmResponsesLive;
	},
	SerpApi: class {
		googleAiModeLiveAdvanced = dataforseoClient.googleAiModeLiveAdvanced;
	},
	SerpGoogleAiModeLiveAdvancedRequestInfo: class {
		constructor(args: Record<string, unknown>) {
			Object.assign(this, args);
		}
	},
}));

import { dataforseo } from "./dataforseo";

afterEach(() => {
	vi.clearAllMocks();
});

describe("dataforseo provider", () => {
	it("rejects prompts longer than DataForSEO's 500 character limit before calling the API", async () => {
		await expect(dataforseo.run("chatgpt", "x".repeat(501), { webSearch: true })).rejects.toThrow(
			/DataForSEO prompts must be 500 characters or fewer/,
		);

		expect(dataforseoClient.chatgptLlmResponsesLive).not.toHaveBeenCalled();
	});

	it("does not send country localization for DataForSEO LLM Responses targets", async () => {
		dataforseoClient.chatgptLlmResponsesLive.mockResolvedValueOnce({
			tasks: [
				{
					status_code: 20000,
					status_message: "Ok.",
					result: [
						{
							model_name: "gpt-4o",
							fan_out_queries: ["current laptop reviews"],
							items: [
								{
									type: "message",
									sections: [
										{
											type: "text",
											text: "A current well-reviewed laptop is the Framework Laptop 13, based on recent reviews.",
											annotations: [{ url: "https://example.com/review", title: "Example review" }],
										},
									],
								},
							],
						},
					],
				},
			],
		});

		const options = { webSearch: true, country: "GB" } as unknown as Parameters<typeof dataforseo.run>[2];
		await dataforseo.run("chatgpt", "What is a well-reviewed laptop this month?", options);

		const [payload] = dataforseoClient.chatgptLlmResponsesLive.mock.calls[0];
		expect(payload[0]).not.toHaveProperty("web_search_country_iso_code");
		expect(payload[0]).toMatchObject({
			user_prompt: "What is a well-reviewed laptop this month?",
			model_name: "gpt-4o",
			web_search: true,
		});
	});
});
