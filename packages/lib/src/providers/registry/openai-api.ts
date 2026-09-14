import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, type InferToolOutput } from "ai";
import { getCredential } from "../../secrets";
import { extractCitationsFromOpenAI, extractTextFromOpenAI } from "../../text-extraction";
import {
	API_PROVIDER_MAX_OUTPUT_TOKENS,
	configuredWhen,
	OPENAI_WEB_SEARCH_CONTEXT_SIZE,
	OPENAI_WEB_SEARCH_MAX_TOOL_CALLS,
	RESEARCH_WEB_SEARCH_CONTEXT_SIZE,
	RESEARCH_WEB_SEARCH_MAX_USES,
	reportedWebQueries,
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
import { nonEmptyStrings } from "./scrape-shared";

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";

function getOpenAIResponsesModel(model: string) {
	const apiKey = getCredential("OPENAI_API_KEY");
	const provider = apiKey ? createOpenAI({ apiKey }) : openai;
	return provider.responses(model);
}

type WebSearchOutput = InferToolOutput<ReturnType<typeof openai.tools.webSearch>>;

/**
 * The web-search tool runs on OpenAI's side, so the query it actually issued
 * comes back on the tool *result*, not the call — the call's input is empty.
 * A single search reports `query`; a fanned-out one reports `queries`.
 *
 * `tools` is only passed when web search is on, so the compiler can't tie a
 * result back to the tool that produced it and types `output` as `unknown`;
 * callers establish that link by matching `toolName` first. The shape itself is
 * the SDK's, so a renamed field still fails the build here.
 */
function webSearchQueries(output: unknown): string[] {
	const action = (output as WebSearchOutput).action;
	if (action?.type !== "search") return [];
	return nonEmptyStrings([action.query, ...(action.queries ?? [])]);
}

/** Whether the SDK handed back a real Responses payload rather than nothing. */
function isResponsesPayload(body: unknown): body is { output: unknown[] } {
	return Array.isArray((body as { output?: unknown } | null | undefined)?.output);
}

/** The answer and its citations in the "output" shape the OpenAI extractors read. */
function rebuildRawOutput(result: { text: string; sources: readonly { sourceType: string }[] }) {
	const annotations = result.sources
		.filter((source): source is typeof source & { url: string; title?: string } => source.sourceType === "url")
		.map((source) => ({ type: "url_citation", url: source.url, title: source.title }));
	return {
		output: [{ type: "message", content: [{ type: "output_text", text: result.text, annotations }] }],
	};
}

async function runOpenAI(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const webSearch = options?.webSearch === true;

	const result = await generateText({
		// Routed through getOpenAIResponsesModel (not the bare `openai` global,
		// which reads process.env internally) so overlay credentials apply here.
		model: getOpenAIResponsesModel(model),
		prompt,
		maxOutputTokens: API_PROVIDER_MAX_OUTPUT_TOKENS["openai-api"],
		toolChoice: webSearch ? "auto" : "none",
		...(webSearch
			? {
					tools: { web_search: openai.tools.webSearch({ searchContextSize: OPENAI_WEB_SEARCH_CONTEXT_SIZE }) },
					providerOptions: { openai: { maxToolCalls: OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } },
				}
			: {}),
	});

	warnIfOutputCapped("openai-api", model, result.finishReason);

	// Store the Responses payload itself, so everything reported here can be
	// re-derived from the stored row later — its web_search_call items are the
	// only record of what the model searched.
	//
	// Older SDK versions left `response.body` unset, which is what the rebuild
	// below covers: an "output" shape carrying just the answer and its citation
	// annotations, and no search calls at all.
	const body = result.response?.body;
	const rawOutput = isResponsesPayload(body) ? body : rebuildRawOutput(result);

	const webQueries = result.content.flatMap((part) =>
		part.type === "tool-result" && part.toolName === "web_search" ? webSearchQueries(part.output) : [],
	);

	return {
		rawOutput,
		webQueries: reportedWebQueries(webQueries, { webSearch: options?.webSearch ?? false }),
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
	isConfigured: configuredWhen("OPENAI_API_KEY"),

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_RESEARCH_MODEL;
		return runOpenAI(prompt, version, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const object = await structuredResearch(getOpenAIResponsesModel(DEFAULT_RESEARCH_MODEL), {
			prompt,
			schema,
			...(webSearch
				? {
						tools: {
							web_search: openai.tools.webSearch({ searchContextSize: RESEARCH_WEB_SEARCH_CONTEXT_SIZE }),
						},
						providerOptions: { openai: { maxToolCalls: RESEARCH_WEB_SEARCH_MAX_USES } },
					}
				: {}),
		});
		return { object, modelVersion: DEFAULT_RESEARCH_MODEL };
	},
};
