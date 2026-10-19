import { getCredential } from "../../secrets";
import { type Citation, normalizeCitationTitle } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, reportedWebQueries, warnIfOutputCapped } from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { jsonSchemaResponseFormat, parseSchemaJson } from "./ai-sdk";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_API_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
// Must be a family with OpenRouter's *native* web-search plugin (vs the Exa
// fallback); per the docs that's OpenAI, Anthropic, Perplexity, and xAI.
const DEFAULT_RESEARCH_MODEL = "anthropic/claude-sonnet-5.5";

function openrouterHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getCredential("OPENROUTER_API_KEY")}`,
		"Content-Type": "application/json",
		"HTTP-Referer": process.env.APP_URL ?? "https://github.com/elmohq/elmo",
		"X-Title": "Elmo AEO",
	};
}

function extractCitationsFromOpenRouterResponse(data: any): Citation[] {
	const citations: Citation[] = [];
	let idx = 0;
	const seen = new Set<string>();
	const annotations = data?.choices?.[0]?.message?.annotations ?? [];
	for (const ann of annotations) {
		if (ann?.type !== "url_citation") continue;
		// OpenRouter nests citation data under url_citation, but also support flat layout
		const cite = ann.url_citation ?? ann;
		const url = cite.url;
		if (!url || typeof url !== "string" || !url.startsWith("http")) continue;
		if (seen.has(url)) continue;
		seen.add(url);
		try {
			const parsed = new URL(url);
			citations.push({
				url,
				title: normalizeCitationTitle(cite.title),
				domain: parsed.hostname.replace(/^www\./, ""),
				citationIndex: idx++,
			});
		} catch (e) {
			console.warn(`OpenRouter: skipping invalid citation URL: ${url}`, e);
		}
	}
	return citations;
}

export const openrouter: Provider = {
	id: "openrouter",
	name: "OpenRouter",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("OPENROUTER_API_KEY"),

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		// Raw fetch (no AI SDK) so we can attach the OpenRouter `plugins` field
		// — the AI SDK's OpenAI-compat path doesn't pass it through.
		const body: Record<string, unknown> = {
			model: DEFAULT_RESEARCH_MODEL,
			messages: [{ role: "user", content: prompt }],
			response_format: jsonSchemaResponseFormat(schema),
		};
		// `engine: "native"` runs the underlying provider's real web-search tool
		// (e.g. Anthropic's web_search_20250305) instead of the Exa fallback.
		if (webSearch) body.plugins = [{ id: "web", engine: "native" }];
		const res = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: openrouterHeaders(),
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
		}
		const data: any = await res.json();
		const content = data?.choices?.[0]?.message?.content;
		if (typeof content !== "string") {
			throw new Error(`OpenRouter returned no JSON content (model=${DEFAULT_RESEARCH_MODEL})`);
		}
		return {
			object: parseSchemaJson(schema, content),
			// Report the alias we sent, not OpenRouter's resolved version
			// (e.g. "openai/gpt-5-mini" vs "openai/gpt-5-mini-2025-08-07") —
			// matches what openai-api and anthropic-api do.
			modelVersion: DEFAULT_RESEARCH_MODEL,
		};
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		let modelSlug = options?.version;
		if (!modelSlug) {
			throw new Error(
				`OpenRouter requires a version slug in SCRAPE_TARGETS. ` +
					`Example: ${model}:openrouter:openai/gpt-5-mini:online`,
			);
		}

		// ":online" is exactly equivalent to plugins: [{ id: "web" }], and with the
		// engine unset OpenRouter routes to the model provider's native web search
		// (Exa only as a fallback) — which is the consumer surface Elmo tracks.
		if (options?.webSearch && !modelSlug.includes(":online")) {
			modelSlug = `${modelSlug}:online`;
		}

		const body: Record<string, unknown> = {
			model: modelSlug,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter,
		};

		// Use raw fetch instead of SDK — the SDK's ChatAssistantMessage Zod schema
		// strips annotations from responses, which contain web search citations.
		// The SDK's Responses API (client.responses.send()) does preserve annotations
		// via ResponseOutputText, but it's currently in beta. Consider switching to
		// the Responses API + SDK when it's stable.
		const res = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: openrouterHeaders(),
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
		}

		const data: any = await res.json();

		warnIfOutputCapped("openrouter", modelSlug, data?.choices?.[0]?.finish_reason);

		const citations = extractCitationsFromOpenRouterResponse(data);

		return {
			rawOutput: data,
			// OpenRouter doesn't expose the search queries the model made internally.
			webQueries: reportedWebQueries([], { searchProven: citations.length > 0 }),
			modelVersion: data?.model ?? modelSlug.replace(":online", ""),
		};
	},
};
