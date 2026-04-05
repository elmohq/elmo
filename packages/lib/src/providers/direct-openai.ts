import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { extractTextFromOpenAI, extractCitationsFromOpenAI } from "../text-extraction";
import type { Provider, ScrapeResult, ProviderOptions, TestResult } from "./types";

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

export const directOpenai: Provider = {
	id: "direct-openai",
	name: "Direct OpenAI API",

	isConfigured() {
		return !!process.env.OPENAI_API_KEY;
	},

	supportedEngines() {
		return ["chatgpt"];
	},

	supportsWebSearchToggle() {
		return true;
	},

	async run(engine: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const model = options?.model ?? "gpt-5-mini";
		return runOpenAI(prompt, model, options);
	},

	async testConnection(engine: string): Promise<TestResult> {
		const start = Date.now();
		try {
			const result = await this.run(engine, "What is 2+2?", { webSearch: false });
			return {
				success: true,
				latencyMs: Date.now() - start,
				sampleOutput: result.textContent.slice(0, 200),
			};
		} catch (error) {
			return {
				success: false,
				latencyMs: Date.now() - start,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
};
