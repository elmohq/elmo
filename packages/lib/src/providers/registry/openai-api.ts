import { openai, createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import { extractTextFromOpenAI, extractCitationsFromOpenAI } from "../../text-extraction";
import type { Provider, ScrapeResult, ProviderOptions } from "../types";

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
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

	languageModel(model = DEFAULT_RESEARCH_MODEL): LanguageModel {
		if (process.env.OPENAI_API_KEY) {
			return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
		}
		return openai(model);
	},
};
