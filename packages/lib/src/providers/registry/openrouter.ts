import type { z } from "zod";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { getCredential } from "../../secrets";
import { type Citation, normalizeCitationTitle } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, warnIfOutputCapped } from "../config";
import { prepareStructuredOutputSchema } from "../schema-contract";
import {
	type Provider,
	type ProviderOptions,
	type ScrapeResult,
	STRUCTURED_RESEARCH_ERROR_TYPE_PATTERN,
	type StructuredResearchOptions,
	StructuredResearchRequestError,
	type StructuredResearchRequestSummary,
	StructuredResearchResponseError,
	type StructuredResearchResult,
	type StructuredResearchUsage,
} from "../types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_API_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
// Default to GPT-5 Mini via OpenRouter — supports OpenRouter's *native*
// web search (vs the Exa fallback) and produced the best brand-info
// recall + cheapest cost in our compare-onboarding runs. Other families that
// support native search per the docs: Anthropic, Perplexity, xAI.
const DEFAULT_RESEARCH_MODEL = "openai/gpt-5-mini";

// Search-result localization only: OpenRouter forwards this to the model
// provider's own web search as the searcher's approximate location. It does
// not change the request origin, the OpenRouter region, or where data is
// processed. Kept country-level on purpose (no city/region bias), and only
// native provider search honors it (Exa & co. ignore it).
const WEB_SEARCH_USER_LOCATION = Object.freeze({
	type: "approximate",
	country: "DE",
	timezone: "Europe/Berlin",
});

/**
 * Request fields that turn on OpenRouter's `openrouter:web_search` server tool
 * for one web-enabled call. The deprecated `:online` suffix and `web` plugin
 * cannot carry a location, so every web-enabled call goes through this tool.
 *
 * The legacy plugin always ran exactly one search; the server tool lets the
 * model search 0..N times. `tool_choice: "required"` + `max_tool_calls: 1`
 * pins it back to one mandatory search so tracked runs keep comparable cost
 * and behavior.
 *
 * For Luna model: `tool_choice: "auto"` allows the model to decide whether to search (0 or 1),
 * while keeping other models at `required` for consistency.
 */
function webSearchRequestFields(toolChoice: "required" | "auto" = "required"): Record<string, unknown> {
	return {
		tools: [
			{
				type: "openrouter:web_search",
				parameters: {
					engine: "native",
					user_location: { ...WEB_SEARCH_USER_LOCATION },
				},
			},
		],
		tool_choice: toolChoice,
		max_tool_calls: 1,
	};
}

/**
 * `SCRAPE_TARGETS` keeps `:online` as Elmo's web-search flag; the parser strips
 * it before the version reaches us, but a slug handed over with the legacy
 * suffix must still not activate search twice. Only a terminal `:online` is a
 * flag — other variants such as `:free` are part of the model id.
 */
function bareModelSlug(modelSlug: string): string {
	return modelSlug.replace(/:online$/, "");
}

/**
 * OpenRouter's canonical typed code, `error.metadata.error_type`, which its
 * documentation designates as the field to switch on programmatically instead
 * of the HTTP status. It is the only source of a refusal's type: the status,
 * the message, `metadata.raw` and `metadata.provider_code` never stand in for
 * it. Absent or malformed → null.
 */
function canonicalErrorType(error: { metadata?: unknown }): string | null {
	const metadata = error.metadata;
	if (metadata === null || typeof metadata !== "object") return null;
	const type = (metadata as { error_type?: unknown }).error_type;
	return typeof type === "string" && STRUCTURED_RESEARCH_ERROR_TYPE_PATTERN.test(type) ? type : null;
}

function retryAfterMs(res: { headers?: { get?(name: string): string | null } }): number | null {
	const header = res.headers?.get?.("retry-after");
	if (!header) return null;
	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
	const at = Date.parse(header);
	return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * The typed refusal for a non-2xx structured-research response. The body is
 * read once: a structured OpenRouter error envelope may carry the canonical
 * `error.metadata.error_type`; a body that also carries a generation id,
 * usage, choices or content is flagged, because such a response was not a
 * free refusal. The message keeps the status and the body text (never the
 * credential) for logs.
 */
async function structuredRequestError(res: Response): Promise<StructuredResearchRequestError> {
	const status = res.status;
	const text = await res.text();
	let body: any = null;
	try {
		body = JSON.parse(text);
	} catch {
		body = null;
	}
	const error = body?.error;
	const structured =
		error !== null && typeof error === "object" && typeof error.message === "string" && typeof error.code === "number";
	const carriesOutput =
		typeof body?.id === "string" ||
		(body?.usage !== undefined && body?.usage !== null) ||
		(Array.isArray(body?.choices) && body.choices.length > 0) ||
		typeof body?.output === "string";
	return new StructuredResearchRequestError({
		provider: "openrouter",
		httpStatus: status,
		errorType: structured ? canonicalErrorType(error) : null,
		structured,
		carriesOutput,
		retryAfterMs: retryAfterMs(res),
		message: `OpenRouter API error (${status}): ${text}`,
	});
}

function openrouterHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getCredential("OPENROUTER_API_KEY")}`,
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

/** A count: a finite, non-negative integer. Strings, NaN, ±Infinity, negatives and fractions are not reported. */
const countOrNull = (value: unknown): number | null =>
	typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** An amount: a finite, non-negative number. */
const amountOrNull = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const record = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

/**
 * Chat-completions responses report `prompt_tokens`/`completion_tokens`,
 * Responses-style payloads `input_tokens`/`output_tokens`. The documented
 * chat key wins when present, whatever its value; the alternative is read
 * only when the documented key is absent.
 */
function firstPresent(u: Record<string, unknown>, keys: readonly string[]): unknown {
	for (const key of keys) if (u[key] !== undefined) return u[key];
	return undefined;
}

/**
 * The web-search counter has been observed under two parents:
 * `server_tool_use` (documented) and `server_tool_use_details` (seen in
 * live responses). Both are read; when both carry a valid count and the
 * counts differ, neither is trusted and the conflict is reported.
 */
function webSearchRequests(
	u: Record<string, unknown>,
): Pick<StructuredResearchUsage, "webSearchRequests" | "webSearchRequestsConflict"> {
	const reported = [record(u.server_tool_use), record(u.server_tool_use_details)]
		.map((parent) => countOrNull(parent?.web_search_requests))
		.filter((count): count is number => count !== null);
	if (reported.length === 0) return { webSearchRequests: null, webSearchRequestsConflict: false };
	if (reported.every((count) => count === reported[0])) {
		return { webSearchRequests: reported[0], webSearchRequestsConflict: false };
	}
	return { webSearchRequests: null, webSearchRequestsConflict: true };
}

/**
 * The numeric usage fields OpenRouter reports on every response (usage
 * accounting is always on): token counts, the total charged `cost`, the
 * reasoning-token detail and the web-search server-tool counter. Nothing
 * else from the payload is retained, and nothing is coerced: a field that is
 * not a valid number of its kind is reported as `null`.
 */
export function parseOpenRouterUsage(usage: unknown): StructuredResearchUsage | undefined {
	const u = record(usage);
	if (!u) return undefined;
	const details = record(firstPresent(u, ["completion_tokens_details", "output_tokens_details"]));
	return {
		inputTokens: countOrNull(firstPresent(u, ["prompt_tokens", "input_tokens"])),
		outputTokens: countOrNull(firstPresent(u, ["completion_tokens", "output_tokens"])),
		reasoningTokens: countOrNull(details?.reasoning_tokens),
		costUsd: amountOrNull(u.cost),
		...webSearchRequests(u),
	};
}

/** The verifiable part of a request body, read back from what is about to be sent. */
function summarizeRequest(body: Record<string, unknown>): StructuredResearchRequestSummary {
	const responseFormat = body.response_format as { type?: unknown; json_schema?: { strict?: unknown } } | undefined;
	const routing = body.provider as { require_parameters?: unknown } | undefined;
	return {
		model: String(body.model),
		webSearch: Array.isArray(body.tools) && body.tools.length > 0,
		maxToolCalls: typeof body.max_tool_calls === "number" ? body.max_tool_calls : null,
		maxOutputTokens: typeof body.max_tokens === "number" ? body.max_tokens : null,
		strictJsonSchema: responseFormat?.type === "json_schema" && responseFormat.json_schema?.strict === true,
		requireParameters: routing?.require_parameters === true,
	};
}

/**
 * OpenRouter routing may otherwise fall back to a provider that ignores a
 * request parameter it does not support; a structured call depends on
 * `response_format` and the server tool being honoured, so routing is
 * restricted to providers that support every parameter sent.
 */
const STRICT_ROUTING = Object.freeze({ require_parameters: true });

export const openrouter: Provider = {
	id: "openrouter",
	name: "OpenRouter",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured() {
		return !!getCredential("OPENROUTER_API_KEY");
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
		signal,
		maxOutputTokens,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		// Raw fetch (no AI SDK) so we can attach OpenRouter's server-tool fields
		// — the AI SDK's OpenAI-compat path doesn't pass them through. The schema is
		// refused locally before the request leaves when strict mode would refuse it.
		const jsonSchema = prepareStructuredOutputSchema(schema as z.ZodType);
		const body: Record<string, unknown> = {
			model: DEFAULT_RESEARCH_MODEL,
			messages: [{ role: "user", content: prompt }],
			response_format: {
				type: "json_schema",
				json_schema: { name: "research_output", strict: true, schema: jsonSchema },
			},
			provider: { ...STRICT_ROUTING },
			...(maxOutputTokens !== undefined ? { max_tokens: maxOutputTokens } : {}),
			...(webSearch ? webSearchRequestFields() : {}),
		};
		const res = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: openrouterHeaders(),
			body: JSON.stringify(body),
			signal,
		});
		if (!res.ok) throw await structuredRequestError(res);
		const data: any = await res.json();
		// The response is charged whatever its content: the audit envelope is
		// read first so a content defect never loses the generation or the cost.
		const envelope = {
			provider: "openrouter",
			// Report the alias we sent, not OpenRouter's resolved version
			// (e.g. "openai/gpt-5-mini" vs "openai/gpt-5-mini-2025-08-07") —
			// matches what openai-api and anthropic-api do.
			model: DEFAULT_RESEARCH_MODEL,
			generationId: typeof data?.id === "string" ? data.id : null,
			request: summarizeRequest(body),
			usage: parseOpenRouterUsage(data?.usage),
		};
		const content = data?.choices?.[0]?.message?.content;
		if (typeof content !== "string") throw new StructuredResearchResponseError("no-content", envelope);
		let json: unknown;
		try {
			json = JSON.parse(content);
		} catch {
			throw new StructuredResearchResponseError("invalid-json", envelope);
		}
		const parsed = (schema as z.ZodType).safeParse(json);
		if (!parsed.success) throw new StructuredResearchResponseError("schema", envelope);
		return {
			object: parsed.data as T,
			modelVersion: envelope.model,
			generationId: envelope.generationId,
			usage: envelope.usage,
			request: envelope.request,
		};
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		if (!options?.version) {
			throw new Error(
				`OpenRouter requires a version slug in SCRAPE_TARGETS. ` +
					`Example: ${model}:openrouter:openai/gpt-5-mini:online`,
			);
		}
		const modelSlug = bareModelSlug(options.version);
		const isLunaModel = modelSlug === "openai/gpt-5.6-luna";

		const body: Record<string, unknown> = {
			model: modelSlug,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter,
		};

		// Luna: optional web search with auto tool choice and disabled plugin.
		// Other models: required search when enabled, for consistency with tracked runs.
		if (isLunaModel) {
			// Disable the default OpenRouter web plugin, which could bypass tool_choice: "auto"
			body.plugins = [{ id: "web", enabled: false }];
			if (options.webSearch) {
				// Luna can choose whether to search (0 or 1)
				Object.assign(body, webSearchRequestFields("auto"));
			}
		} else {
			// Non-Luna models maintain required search behavior
			if (options.webSearch) {
				Object.assign(body, webSearchRequestFields("required"));
			}
		}

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
		// OpenRouter doesn't expose what search queries the model made internally.
		// Only mark as "unavailable" when citations prove a web search happened.
		const webQueries = citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [];

		return {
			rawOutput: data,
			textContent: extractTextFromOpenRouterResponse(data),
			webQueries,
			citations,
			modelVersion: data?.model ?? modelSlug,
		};
	},
};
