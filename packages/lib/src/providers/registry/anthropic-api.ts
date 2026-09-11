import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import Anthropic from "@anthropic-ai/sdk";
import { getCredential } from "../../secrets";
import { extractCitationsFromAnthropic, extractTextFromAnthropic } from "../../text-extraction";
import {
	ANTHROPIC_WEB_SEARCH_MAX_USES,
	API_PROVIDER_MAX_OUTPUT_TOKENS,
	configuredWhen,
	RESEARCH_WEB_SEARCH_MAX_USES,
	warnIfOutputCapped,
} from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { structuredResearch } from "./ai-sdk";
import { sanitizeForJson } from "./scrape-shared";

const DEFAULT_RESEARCH_MODEL = "claude-sonnet-5";

function getAnthropicLanguageModel(model: string) {
	const apiKey = getCredential("ANTHROPIC_API_KEY");
	return apiKey ? createAnthropic({ apiKey })(model) : anthropic(model);
}

function getClient(): Anthropic {
	return new Anthropic({ apiKey: getCredential("ANTHROPIC_API_KEY")! });
}

async function runAnthropic(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const client = getClient();
	const tools: Anthropic.Messages.ToolUnion[] = [];
	if (options?.webSearch) {
		tools.push({
			type: "web_search_20250305",
			name: "web_search",
			max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES,
		});
	}

	const makeRequest = () =>
		client.messages.create({
			model,
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["anthropic-api"],
			messages: [{ role: "user", content: prompt }],
			...(tools.length > 0 ? { tools } : {}),
		});

	let response = await makeRequest();

	// Check for web search errors like max_uses_exceeded and retry once
	for (const block of response.content) {
		const b = block as any;
		if (b.type === "web_search_tool_result" && b.content?.type === "web_search_tool_result_error") {
			console.warn(`[anthropic-api] web search error: ${b.content.error_code}, retrying in 10s...`);
			await new Promise((r) => setTimeout(r, 10_000));
			response = await makeRequest();
			break;
		}
	}

	warnIfOutputCapped("anthropic-api", model, response.stop_reason);

	const textContent = extractTextFromAnthropic(response);

	const webQueries = response.content
		.filter((block) => block.type === "server_tool_use" && (block as any).name === "web_search")
		.map((block) => (block as any).input?.query)
		.filter(Boolean);

	const citations = extractCitationsFromAnthropic(response);

	// Strip full page text from web search results to reduce storage.
	// Only url/title are used for citation extraction.
	const trimmedContent = response.content.map((block: any) => {
		if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) return block;
		return {
			...block,
			content: block.content.map((r: any) =>
				r.type === "web_search_result" ? { type: r.type, url: r.url, title: r.title } : r,
			),
		};
	});

	return {
		rawOutput: sanitizeForJson({ ...response, content: trimmedContent }),
		webQueries,
		textContent,
		citations,
		modelVersion: model,
	};
}

export const anthropicApi: Provider = {
	id: "anthropic-api",
	name: "Anthropic API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("ANTHROPIC_API_KEY"),

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_RESEARCH_MODEL;
		return runAnthropic(prompt, version, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const object = await structuredResearch(getAnthropicLanguageModel(DEFAULT_RESEARCH_MODEL), {
			prompt,
			schema,
			...(webSearch
				? { tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: RESEARCH_WEB_SEARCH_MAX_USES }) } }
				: {}),
		});
		return { object, modelVersion: DEFAULT_RESEARCH_MODEL };
	},
};
