import { openai, createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { extractTextFromOpenAI, extractCitationsFromOpenAI } from "../../text-extraction";
import { getCredential } from "../../secrets";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } from "../config";
import type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";

function getOpenAIResponsesModel(model: string) {
	const apiKey = getCredential("OPENAI_API_KEY");
	const provider = apiKey ? createOpenAI({ apiKey }) : openai;
	return provider.responses(model);
}

async function runOpenAI(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const tools: Record<string, any> = {};
	if (options?.webSearch) {
		tools.web_search = openai.tools.webSearch({
			searchContextSize: "low",
		}) as any;
	}

	const result = await generateText({
		// Routed through getOpenAIResponsesModel (not the bare `openai` global,
		// which reads process.env internally) so overlay credentials apply here.
		model: getOpenAIResponsesModel(model),
		prompt,
		maxOutputTokens: API_PROVIDER_MAX_OUTPUT_TOKENS["openai-api"],
		toolChoice: Object.keys(tools).length > 0 ? "auto" : "none",
		...(Object.keys(tools).length > 0 ? { tools } : {}),
		...(Object.keys(tools).length > 0
			? { providerOptions: { openai: { maxToolCalls: OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } } }
			: {}),
	});

	// The AI SDK doesn't populate result.response.body for the Responses API, so
	// rebuild the raw output from the parsed result (text + web-search sources)
	// in the "output" shape the OpenAI extractors expect.
	const annotations = (result.sources ?? [])
		.filter((s: any) => s.sourceType === "url" && s.url)
		.map((s: any) => ({ type: "url_citation", url: s.url, title: s.title }));
	const rawOutput = {
		output: [
			{
				type: "message",
				content: [{ type: "output_text", text: result.text, annotations }],
			},
		],
	};

	// Search queries, when the model ran web search. The SDK doesn't reliably
	// surface the raw query, so fall back to "unavailable" (a soft signal).
	const webQueries: string[] = [];
	for (const part of result.content ?? []) {
		const q = (part as any)?.input?.query ?? (part as any)?.action?.query;
		if (typeof q === "string") webQueries.push(q);
	}
	if (options?.webSearch && webQueries.length === 0) webQueries.push("unavailable");

	return {
		rawOutput,
		webQueries,
		textContent: extractTextFromOpenAI(rawOutput),
		citations: extractCitationsFromOpenAI(rawOutput),
		modelVersion: model,
	};
}

export const openaiApi: Provider = {
	id: "openai-api",
	name: "OpenAI API",

	isConfigured() {
		return !!getCredential("OPENAI_API_KEY");
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_RESEARCH_MODEL;
		return runOpenAI(prompt, version, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const result = await generateText({
			model: getOpenAIResponsesModel(DEFAULT_RESEARCH_MODEL),
			...(webSearch ? { tools: { web_search: openai.tools.webSearch({ searchContextSize: "medium" }) as any } } : {}),
			...(webSearch ? { providerOptions: { openai: { maxToolCalls: 5 } } } : {}),
			output: Output.object({ schema }),
			prompt,
		});
		return {
			object: result.output as T,
			modelVersion: DEFAULT_RESEARCH_MODEL,
		};
	},
};
