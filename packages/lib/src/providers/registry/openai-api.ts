import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
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

function getOpenAIResponsesModel(model: string) {
	const apiKey = getCredential("OPENAI_API_KEY");
	const provider = apiKey ? createOpenAI({ apiKey }) : openai;
	return provider.responses(model);
}

function pushSearchQueries(action: any, queries: string[]): void {
	if (action?.type !== "search") return;
	for (const query of Array.isArray(action.queries) ? action.queries : [action.query]) {
		if (typeof query === "string" && query.trim().length > 0) queries.push(query);
	}
}

/**
 * Search queries the model ran, read from the stored Responses payload —
 * `output[]` carries a `web_search_call` per search, whose `action` lists the
 * `queries` it issued (older responses report a single `query` instead).
 * Reading them from rawOutput rather than the live result is what lets a stored
 * row be re-extracted later.
 */
export function extractWebQueriesFromOpenAI(rawOutput: any): string[] {
	const queries: string[] = [];
	for (const item of Array.isArray(rawOutput?.output) ? rawOutput.output : []) {
		if (item?.type === "web_search_call") pushSearchQueries(item.action, queries);
	}
	return queries;
}

/**
 * The same queries off the live result, for the rebuilt-payload fallback below:
 * the SDK reports each search on the web_search tool's *result* part (the
 * matching call part carries an empty input).
 */
function webQueriesFromContent(content: unknown): string[] {
	const queries: string[] = [];
	for (const part of (content as any[]) ?? []) {
		if (part?.type === "tool-result") pushSearchQueries(part.output?.action, queries);
	}
	return queries;
}

/** Whether the SDK handed back a real Responses payload rather than nothing. */
function isResponsesPayload(body: unknown): body is { output: unknown[] } {
	return Array.isArray((body as any)?.output);
}

/** The answer and its citations in the "output" shape the OpenAI extractors read. */
function rebuildRawOutput(result: { text: string; sources?: unknown[] }) {
	const annotations = (result.sources ?? [])
		.filter((s: any) => s.sourceType === "url" && s.url)
		.map((s: any) => ({ type: "url_citation", url: s.url, title: s.title }));
	return {
		output: [{ type: "message", content: [{ type: "output_text", text: result.text, annotations }] }],
	};
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
		prompt,
		maxOutputTokens: API_PROVIDER_MAX_OUTPUT_TOKENS["openai-api"],
		toolChoice: Object.keys(tools).length > 0 ? "auto" : "none",
		...(Object.keys(tools).length > 0 ? { tools } : {}),
		...(Object.keys(tools).length > 0
			? { providerOptions: { openai: { maxToolCalls: OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } } }
			: {}),
	});

	warnIfOutputCapped("openai-api", model, result.finishReason);

	// Store the Responses payload itself. It holds the web_search_call items, so
	// everything reported here can be re-derived from the stored row later.
	//
	// Older SDK versions left `response.body` unset, which is what the rebuild
	// below covers: an "output" shape carrying just the answer and its citation
	// annotations. It has no web_search_call items, so a row written from it can
	// never yield queries — hence reading those from the live result instead.
	const body = result.response?.body;
	const rawOutput = isResponsesPayload(body) ? body : rebuildRawOutput(result);

	const webQueries = isResponsesPayload(body)
		? extractWebQueriesFromOpenAI(body)
		: webQueriesFromContent(result.content);
	if (options?.webSearch && webQueries.length === 0) webQueries.push(WEB_QUERIES_UNAVAILABLE);

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
	access: "api",
	docsAnchor: "direct-model-apis",

	/** Always — web_search_call items in the Responses payload. */
	exposesWebQueries: () => true,
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
