import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { extractUsage } from "../usage";
import type { Citation } from "../../text-extraction";

const MISTRAL_BASE_URL = "https://api.mistral.ai";
const DEFAULT_MODEL = "mistral-medium-latest";
const DEFAULT_RESEARCH_MODEL = DEFAULT_MODEL;

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

function authHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
		"Content-Type": "application/json",
	};
}

async function runChatCompletions(prompt: string, model: string): Promise<ScrapeResult> {
	const res = await fetch(`${MISTRAL_BASE_URL}/v1/chat/completions`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
		}),
	});

	if (!res.ok) {
		throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
	}

	const data: any = await res.json();
	const textContent = data?.choices?.[0]?.message?.content ?? "No text content found in Mistral response.";

	return {
		rawOutput: data,
		textContent,
		webQueries: [],
		citations: [],
		modelVersion: data?.model ?? model,
	};
}

async function runConversationsWithWebSearch(prompt: string, model: string): Promise<ScrapeResult> {
	const res = await fetch(`${MISTRAL_BASE_URL}/v1/conversations`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			model,
			inputs: prompt,
			tools: [{ type: "web_search" }],
		}),
	});

	if (!res.ok) {
		throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
	}

	const data: any = await res.json();
	const { textContent, citations, webQueries } = parseConversationsResponse(data);

	return {
		rawOutput: data,
		textContent,
		webQueries,
		citations,
		modelVersion: data?.model ?? model,
	};
}

function parseConversationsResponse(data: any): { textContent: string; citations: Citation[]; webQueries: string[] } {
	const texts: string[] = [];
	const citations: Citation[] = [];
	const webQueries: string[] = [];
	const seen = new Set<string>();
	let idx = 0;

	const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
	for (const entry of outputs) {
		// Tool execution entries surface the search query. `arguments` is a JSON-encoded
		// string in the live response, but we also handle the parsed-object form defensively.
		if ((entry?.type === "tool.execution" || entry?.type === "tool_execution") &&
			(entry?.name === "web_search" || entry?.function === "web_search")) {
			const query = extractMistralQuery(entry);
			if (query) webQueries.push(query);
		}

		// Message output entries hold the model's text + reference chunks.
		const content = Array.isArray(entry?.content) ? entry.content : [];
		for (const chunk of content) {
			if (chunk?.type === "text" && typeof chunk.text === "string") {
				texts.push(chunk.text);
			} else if (chunk?.type === "tool_reference" && typeof chunk.url === "string") {
				if (seen.has(chunk.url)) continue;
				seen.add(chunk.url);
				try {
					const parsed = new URL(chunk.url);
					citations.push({
						url: chunk.url,
						title: chunk.title ?? undefined,
						domain: parsed.hostname.replace(/^www\./, ""),
						citationIndex: idx++,
					});
				} catch (e) {
					console.warn(`Mistral: skipping invalid citation URL: ${chunk.url}`, e);
				}
			}
		}
	}

	const textContent = texts.length > 0 ? texts.join("\n") : "No text content found in Mistral response.";
	return { textContent, citations, webQueries };
}

function extractMistralQuery(entry: any): string | null {
	const args = entry?.arguments;
	let parsed: any = args;
	if (typeof args === "string") {
		try { parsed = JSON.parse(args); } catch { parsed = null; }
	}
	const query = parsed?.query ?? entry?.input?.query;
	return typeof query === "string" && query.trim() ? query : null;
}

export const mistralApi: Provider = {
	id: "mistral-api",
	name: "Mistral API",
	defaultResearchModel: DEFAULT_RESEARCH_MODEL,

	isConfigured() {
		return !!process.env.MISTRAL_API_KEY;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_MODEL;
		const result = options?.webSearch
			? await runConversationsWithWebSearch(prompt, version)
			: await runChatCompletions(prompt, version);
		return { ...result, rawOutput: sanitizeForJson(result.rawOutput) };
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		model,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		// Mistral's chat completions endpoint is OpenAI-compatible and honors
		// `response_format: json_schema`. The web-search-enabled Conversations
		// API isn't on the AI SDK, so onboarding via Mistral runs without web
		// search — Mistral users who want web-search-backed research should
		// configure ONBOARDING_LLM_TARGET to point at OpenRouter or Anthropic.
		const slug = model ?? DEFAULT_RESEARCH_MODEL;
		const provider = createOpenAI({
			baseURL: `${MISTRAL_BASE_URL}/v1`,
			apiKey: process.env.MISTRAL_API_KEY,
		});
		const result = await generateObject({ model: provider(slug), schema, prompt });
		return {
			object: result.object,
			usage: extractUsage(result.usage),
			modelVersion: slug,
		};
	},
};
