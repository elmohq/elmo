import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { getCredential } from "../../secrets";
import { extractCitationsFromOpenAI, extractTextFromOpenAI } from "../../text-extraction";
import {
	API_PROVIDER_MAX_OUTPUT_TOKENS,
	OPENAI_WEB_SEARCH_CONTEXT_SIZE,
	OPENAI_WEB_SEARCH_MAX_TOOL_CALLS,
	RESEARCH_WEB_SEARCH_CONTEXT_SIZE,
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

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";
const OPENAI_CALL_TIMEOUT_MS = 10 * 60 * 1000;

function getOpenAIResponsesModel(model: string) {
	const apiKey = getCredential("OPENAI_API_KEY");
	const provider = apiKey ? createOpenAI({ apiKey }) : openai;
	return provider.responses(model);
}

async function runOpenAI(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const tools: Record<string, any> = {};
	if (options?.webSearch) {
		tools.web_search = openai.tools.webSearch({
			searchContextSize: OPENAI_WEB_SEARCH_CONTEXT_SIZE,
		}) as any;
	}

	const result = await generateText({
		// Routed through getOpenAIResponsesModel (not the bare `openai` global,
		// which reads process.env internally) so overlay credentials apply here.
		model: getOpenAIResponsesModel(model),
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(OPENAI_CALL_TIMEOUT_MS),
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
	await options?.checkpointRawResponse?.({ rawOutput, modelVersion: model });
	warnIfOutputCapped("openai-api", model, result.finishReason);

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
	structuredResearchModel: DEFAULT_RESEARCH_MODEL,

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
		signal,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const result = await generateText({
			model: getOpenAIResponsesModel(DEFAULT_RESEARCH_MODEL),
			maxRetries: 0,
			abortSignal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(OPENAI_CALL_TIMEOUT_MS)])
				: AbortSignal.timeout(OPENAI_CALL_TIMEOUT_MS),
			...(webSearch
				? {
						tools: {
							web_search: openai.tools.webSearch({ searchContextSize: RESEARCH_WEB_SEARCH_CONTEXT_SIZE }) as any,
						},
					}
				: {}),
			...(webSearch ? { providerOptions: { openai: { maxToolCalls: RESEARCH_WEB_SEARCH_MAX_USES } } } : {}),
			output: Output.object({ schema }),
			prompt,
		});
		return {
			object: result.output as T,
			modelVersion: DEFAULT_RESEARCH_MODEL,
		};
	},
};
