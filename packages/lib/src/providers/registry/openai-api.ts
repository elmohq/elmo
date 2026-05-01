import { openai, createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { extractTextFromOpenAI, extractCitationsFromOpenAI } from "../../text-extraction";
import type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { extractUsage } from "../usage";

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

function getOpenAIResponsesModel(model: string) {
	const provider = process.env.OPENAI_API_KEY
		? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
		: openai;
	return provider.responses(model);
}

async function runOpenAI(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const tools: Record<string, any> = {};
	if (options?.webSearch !== false) {
		tools.web_search_preview = openai.tools.webSearchPreview({
			searchContextSize: "low",
		}) as any;
	}

	const result = await generateText({
		model: openai.responses(model),
		prompt,
		toolChoice: Object.keys(tools).length > 0 ? "auto" : "none",
		...(Object.keys(tools).length > 0 ? { tools } : {}),
	});

	const responseBody = result.response?.body as any;

	const webQueries: string[] = [];
	if (responseBody?.output) {
		for (const outputItem of responseBody.output) {
			if (outputItem.type === "web_search_call" && outputItem.action?.query) {
				webQueries.push(outputItem.action.query);
			}
		}
	}

	return {
		rawOutput: sanitizeForJson(responseBody),
		webQueries,
		textContent: extractTextFromOpenAI(responseBody),
		citations: extractCitationsFromOpenAI(responseBody),
		modelVersion: model,
	};
}

export const openaiApi: Provider = {
	id: "openai-api",
	name: "OpenAI API",
	defaultResearchModel: DEFAULT_RESEARCH_MODEL,

	isConfigured() {
		return !!process.env.OPENAI_API_KEY;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_RESEARCH_MODEL;
		return runOpenAI(prompt, version, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		model,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const slug = model ?? DEFAULT_RESEARCH_MODEL;
		const result = await generateText({
			model: getOpenAIResponsesModel(slug),
			tools: {
				web_search_preview: openai.tools.webSearchPreview({ searchContextSize: "low" }) as any,
			},
			experimental_output: Output.object({ schema }),
			prompt,
		});
		// OpenAI's server-side web_search_preview tool calls don't appear in
		// result.toolCalls (that field is for client-defined tools). They show
		// up in the raw Responses API output as type:"web_search_call" items.
		const responseBody = result.response?.body as any;
		const toolCalls: { name: string; input?: unknown }[] = [];
		if (responseBody?.output && Array.isArray(responseBody.output)) {
			for (const item of responseBody.output) {
				if (item?.type === "web_search_call") {
					toolCalls.push({ name: "web_search", input: item.action ?? item });
				}
			}
		}
		return {
			object: result.experimental_output as T,
			usage: extractUsage(result.usage),
			modelVersion: slug,
			...(toolCalls.length > 0 ? { toolCalls } : {}),
		};
	},
};
