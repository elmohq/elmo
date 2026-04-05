import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromAnthropic } from "../text-extraction";
import type { Provider, ScrapeResult, ProviderOptions } from "./types";

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

function getClient(): Anthropic {
	return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

async function runAnthropic(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const client = getClient();
	const tools: Anthropic.Messages.Tool[] = [];
	if (options?.webSearch) {
		tools.push({
			type: "web_search_20250305" as any,
			name: "web_search",
			max_uses: 1,
		} as any);
	}

	const response = await client.messages.create({
		model,
		max_tokens: 4000,
		messages: [{ role: "user", content: prompt }],
		...(tools.length > 0 ? { tools } : {}),
	});

	const textContent = extractTextFromAnthropic(response);

	const webQueries = response.content
		.filter((block) => block.type === "server_tool_use" && (block as any).name === "web_search")
		.map((block) => (block as any).input?.query)
		.filter(Boolean);

	return {
		rawOutput: sanitizeForJson(response),
		webQueries,
		textContent,
		citations: [],
		modelVersion: model,
	};
}

export const directAnthropic: Provider = {
	id: "direct-anthropic",
	name: "Direct Anthropic API",

	isConfigured() {
		return !!process.env.ANTHROPIC_API_KEY;
	},

	async run(engine: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const model = options?.model ?? "claude-sonnet-4-20250514";
		return runAnthropic(prompt, model, options);
	},
};
