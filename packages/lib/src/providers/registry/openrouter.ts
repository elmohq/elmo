import { z } from "zod";
import type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	StructuredResearchOptions,
	StructuredResearchResult,
	StructuredResearchToolCall,
} from "../types";
import type { Citation } from "../../text-extraction";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_API_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
// Default to GPT-5 Mini via OpenRouter — supports OpenRouter's *native*
// web-search plugin (vs the Exa fallback) and produced the best brand-info
// recall + cheapest cost in our compare-onboarding runs. Other families that
// support native search per the docs: Anthropic, Perplexity, xAI.
const DEFAULT_RESEARCH_MODEL = "openai/gpt-5-mini";

function openrouterHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
		"Content-Type": "application/json",
		"HTTP-Referer": process.env.APP_URL ?? "https://github.com/elmohq/elmo",
		"X-Title": "Elmo AEO",
	};
}

function extractTextFromOpenRouterResponse(data: any): string {
	if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
	if (data?.output) {
		const msgs = Array.isArray(data.output) ? data.output.filter((i: any) => i.type === "message") : [];
		const texts: string[] = [];
		for (const msg of msgs) {
			for (const c of msg.content ?? []) {
				if (c.type === "output_text" && c.text) texts.push(c.text);
			}
		}
		if (texts.length) return texts.join("\n");
	}
	return "No text content found in OpenRouter response.";
}

/**
 * Extract evidence of web-search tool use from an OpenRouter response. The
 * native plugin can surface results in different fields depending on the
 * upstream provider — annotations (Anthropic-shaped routes), tool_calls
 * (OpenAI-shaped routes), or only via inflated input_tokens (some natives
 * silently fold search context into the prompt). We try every documented
 * path so the comparison report doesn't show "0 tool calls" for a search
 * that actually ran.
 */
function extractToolCallsFromOpenRouterResponse(data: any): StructuredResearchToolCall[] {
	const calls: StructuredResearchToolCall[] = [];
	const seen = new Set<string>();

	// Path 1: choices[0].message.annotations — citation links (Exa, some natives)
	for (const c of extractCitationsFromOpenRouterResponse(data)) {
		if (seen.has(c.url)) continue;
		seen.add(c.url);
		calls.push({ name: "web_search", input: { url: c.url, title: c.title } });
	}

	// Path 2: choices[0].message.tool_calls — function-calling style
	const tcs = data?.choices?.[0]?.message?.tool_calls;
	if (Array.isArray(tcs)) {
		for (const tc of tcs) {
			const name = tc?.function?.name ?? tc?.type ?? tc?.name ?? "tool";
			const args = tc?.function?.arguments ?? tc?.arguments ?? tc?.input ?? tc;
			calls.push({ name: String(name), input: args });
		}
	}

	return calls;
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
				title: cite.title ?? undefined,
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
	defaultResearchModel: DEFAULT_RESEARCH_MODEL,

	isConfigured() {
		return !!process.env.OPENROUTER_API_KEY;
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		model,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		// Raw fetch (no AI SDK) so we can attach the OpenRouter `plugins` field
		// — the AI SDK's OpenAI-compat path doesn't pass it through. We use
		// `engine: "native"` so the underlying provider's real web-search tool
		// runs (e.g. Anthropic's web_search_20250305) instead of the Exa
		// fallback. Strip any legacy `:online` suffix; the plugin replaces it.
		const slug = (model ?? DEFAULT_RESEARCH_MODEL).replace(/:online$/, "");
		const jsonSchema = z.toJSONSchema(schema as z.ZodType);
		const body = {
			model: slug,
			messages: [{ role: "user", content: prompt }],
			plugins: [{ id: "web", engine: "native" }],
			response_format: {
				type: "json_schema",
				json_schema: { name: "research_output", strict: true, schema: jsonSchema },
			},
		};
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
			throw new Error(`OpenRouter returned no JSON content (model=${slug})`);
		}
		const parsed = (schema as z.ZodType).parse(JSON.parse(content));
		const usage = data?.usage
			? {
					inputTokens: data.usage.prompt_tokens ?? 0,
					outputTokens: data.usage.completion_tokens ?? 0,
					totalTokens:
						data.usage.total_tokens ?? (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
					...(typeof data.usage.prompt_tokens_details?.cached_tokens === "number"
						? { cacheReadTokens: data.usage.prompt_tokens_details.cached_tokens }
						: {}),
				}
			: undefined;
		const toolCalls = extractToolCallsFromOpenRouterResponse(data);

		// Diagnostic: if web search was meant to fire (we set plugins[]) but no
		// signal of it shows up anywhere, dump the response shape once. The
		// prompt was tiny (~1-2k tokens); if input_tokens is much larger, the
		// search added context — somewhere — and our extractor missed it.
		const inputTokens = data?.usage?.prompt_tokens ?? 0;
		if (toolCalls.length === 0 && inputTokens > 5000) {
			console.warn(
				`[openrouter] ${slug}: 0 tool calls extracted but ${inputTokens} input tokens billed (search content was added somewhere). Response shape: ${JSON.stringify({
					choice_keys: Object.keys(data?.choices?.[0] ?? {}),
					message_keys: Object.keys(data?.choices?.[0]?.message ?? {}),
					annotations_count: Array.isArray(data?.choices?.[0]?.message?.annotations)
						? data.choices[0].message.annotations.length
						: undefined,
					tool_calls_count: Array.isArray(data?.choices?.[0]?.message?.tool_calls)
						? data.choices[0].message.tool_calls.length
						: undefined,
					top_level_keys: Object.keys(data ?? {}),
				})}`,
			);
		}

		return {
			object: parsed as T,
			usage,
			modelVersion: data?.model ?? slug,
			...(toolCalls.length > 0 ? { toolCalls } : {}),
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

		if (options?.webSearch && !modelSlug.includes(":online")) {
			modelSlug = `${modelSlug}:online`;
		}

		// Use raw fetch instead of SDK — the SDK's ChatAssistantMessage Zod schema
		// strips annotations from responses, which contain web search citations.
		// The SDK's Responses API (client.responses.send()) does preserve annotations
		// via ResponseOutputText, but it's currently in beta. Consider switching to
		// the Responses API + SDK when it's stable.
		const res = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
				"HTTP-Referer": process.env.APP_URL ?? "https://github.com/elmohq/elmo",
				"X-Title": "Elmo AEO",
			},
			body: JSON.stringify({
				model: modelSlug,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (!res.ok) {
			throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
		}

		const data: any = await res.json();

		const citations = extractCitationsFromOpenRouterResponse(data);
		// OpenRouter doesn't expose what search queries the model made internally.
		// Only mark as "unavailable" when citations prove a web search happened.
		const webQueries = citations.length > 0 ? ["unavailable"] : [];

		return {
			rawOutput: data,
			textContent: extractTextFromOpenRouterResponse(data),
			webQueries,
			citations,
			modelVersion: data?.model ?? modelSlug.replace(":online", ""),
		};
	},
};
