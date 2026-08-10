import * as client from "dataforseo-client";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import {
	extractCitationsFromDataforseoLlm,
	extractCitationsFromDataforseoScraper,
	extractCitationsFromGoogle,
	extractTextFromDataforseoLlm,
	extractTextFromDataforseoScraper,
	extractTextFromGoogle,
} from "../../text-extraction";
import { ProviderResponseError, ProviderRunRejectedError } from "../errors";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import {
	assertPromptLength,
	createDfsAiApi,
	createDfsSerpApi,
	DFS_LANGUAGE_CODE,
	DFS_LOCATION_CODE,
	isDataforseoConfigured,
	sanitizeForJson,
} from "./dataforseo-shared";

/**
 * Models served via the SERP Google AI Mode endpoint (SerpApi). These always
 * use web search and have a SERP-shaped response (items[].type "ai_overview").
 */
const SERP_MODELS = new Set(["google-ai-mode"]);

/**
 * Models served via the AI Optimization "LLM Responses" API
 * (chat_gpt / perplexity / gemini), mapping each Elmo model id to the
 * AiOptimizationApi live method plus a sensible default DataForSEO model_name.
 *
 * ChatGPT and Gemini only take this route when a target pins a model_name via
 * the version slug (`chatgpt:dataforseo:gpt-4.1:online`); with no pin they go
 * to the LLM Scraper below. Perplexity has no scraper, so it always lands here.
 */
const LLM_MODELS: Record<string, { defaultModelName: string; call: keyof typeof LLM_CALLS }> = {
	// gpt-5.5 is the model behind ChatGPT's current default ("GPT-5.5 Instant").
	// DataForSEO's `*-chat-latest` aliases lag the consumer product, so we pin a
	// concrete current model and bump it as ChatGPT advances.
	chatgpt: { defaultModelName: "gpt-5.5", call: "chatgpt" },
	perplexity: { defaultModelName: "sonar", call: "perplexity" },
	gemini: { defaultModelName: "gemini-2.5-flash", call: "gemini" },
};

/**
 * Models served via the AI Optimization "LLM Scraper" API, which drives the
 * real chatgpt.com / gemini.google.com interfaces rather than the vendors'
 * model APIs. This is the default route for these two models: it's what a
 * consumer actually sees. The served model is whatever the live product picks,
 * so pinning a version slug routes to LLM Responses instead.
 *
 * DataForSEO has no Perplexity scraper.
 */
const SCRAPER_CALLS = {
	chatgpt: (api: client.AiOptimizationApi, prompt: string) =>
		api.chatGptLlmScraperLiveAdvanced([
			new client.AiOptimizationChatGptLlmScraperLiveAdvancedRequestInfo({
				keyword: prompt,
				location_code: DFS_LOCATION_CODE,
				language_code: DFS_LANGUAGE_CODE,
				// ChatGPT decides per prompt whether to search; force it so a tracked
				// run always reflects the browsing experience. Gemini always searches
				// and has no equivalent flag.
				force_web_search: true,
			}),
		]),
	gemini: (api: client.AiOptimizationApi, prompt: string) =>
		api.geminiLlmScraperLiveAdvanced([
			new client.AiOptimizationGeminiLlmScraperLiveAdvancedRequestInfo({
				keyword: prompt,
				location_code: DFS_LOCATION_CODE,
				language_code: DFS_LANGUAGE_CODE,
			}),
		]),
} as const;

// Google AI Overview is the AI summary block on a standard Google results page.
// It comes from the Organic SERP endpoint (not AI Mode's dedicated SERP), so it
// gets its own runner rather than joining SERP_MODELS.
const AI_OVERVIEW_MODEL = "google-ai-overview";
const SUPPORTED_MODELS = new Set([...SERP_MODELS, AI_OVERVIEW_MODEL, ...Object.keys(LLM_MODELS)]);
const ACCEPTED_TASK_STATUS_CODES = new Set([20100, 40601, 40602]);

function taskResponseError(
	task: { id?: string | null; status_code?: number | null; status_message?: string | null } | null | undefined,
): Error {
	if (!task) return new Error("DataForSEO API returned no task state after submission");
	const details = `${task.status_code ?? "unknown"} ${task.status_message ?? "Unknown task status"}`;
	if (task.status_code !== null && task.status_code !== undefined && ACCEPTED_TASK_STATUS_CODES.has(task.status_code)) {
		return new ProviderResponseError(`DataForSEO API accepted task ${task.id ?? "without an id"}: ${details}`, {
			taskAccepted: true,
		});
	}
	// DataForSEO's live endpoints can return task state even when no result is
	// present. Unless a status explicitly proves rejection, replacing it could
	// purchase a second copy of work that is still running upstream.
	return new Error(`DataForSEO API returned unresolved task state: ${details}`);
}

/** Models DataForSEO can reach by scraping a live surface rather than an API. */
export const DATAFORSEO_SCRAPED_MODELS = new Set([...SERP_MODELS, AI_OVERVIEW_MODEL, ...Object.keys(SCRAPER_CALLS)]);

interface DataForSeoLlmRequest {
	user_prompt: string;
	model_name: string;
	web_search: boolean;
}

/** Live LLM Responses call dispatch, keyed by Elmo model id. */
const LLM_CALLS = {
	chatgpt: (api: client.AiOptimizationApi, body: DataForSeoLlmRequest[]) =>
		api.chatGptLlmResponsesLive(body.map((b) => new client.AiOptimizationChatGptLlmResponsesLiveRequestInfo(b))),
	perplexity: (api: client.AiOptimizationApi, body: DataForSeoLlmRequest[]) =>
		api.perplexityLlmResponsesLive(body.map((b) => new client.AiOptimizationPerplexityLlmResponsesLiveRequestInfo(b))),
	gemini: (api: client.AiOptimizationApi, body: DataForSeoLlmRequest[]) =>
		api.geminiLlmResponsesLive(body.map((b) => new client.AiOptimizationGeminiLlmResponsesLiveRequestInfo(b))),
} as const;

async function runGoogleAiMode(prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
	assertPromptLength(prompt);
	const api = createDfsSerpApi();
	const requestInfo = new client.SerpGoogleAiModeLiveAdvancedRequestInfo({
		keyword: prompt,
		location_code: DFS_LOCATION_CODE,
		language_code: DFS_LANGUAGE_CODE,
		depth: 10,
	});

	const response = await api.googleAiModeLiveAdvanced([requestInfo]);

	if (!response?.tasks?.length) {
		throw taskResponseError(null);
	}

	const task = response.tasks[0];
	if (task.status_code !== 20000 || !task.result?.length) {
		throw taskResponseError(task);
	}

	const rawOutput = sanitizeForJson(response);
	await options?.checkpointRawResponse?.({ rawOutput, modelVersion: "dataforseo" });
	const citations = extractCitationsFromGoogle(response);
	// Google AI Mode always searches, but DataForSEO doesn't expose the query
	// strings anywhere in its response. Mark "unavailable" when citations
	// prove a search, like the other providers; never echo the prompt (runs
	// before this change did).
	return {
		rawOutput,
		webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
		textContent: extractTextFromGoogle(response),
		citations,
		modelVersion: "dataforseo",
	};
}

async function runGoogleAiOverview(prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
	assertPromptLength(prompt);
	const api = createDfsSerpApi();
	const requestInfo = new client.SerpGoogleOrganicLiveAdvancedRequestInfo({
		keyword: prompt,
		location_code: DFS_LOCATION_CODE,
		language_code: DFS_LANGUAGE_CODE,
		depth: 10,
		// AI Overviews are generated on demand; without this DataForSEO only
		// returns whatever it had cached, so most runs would come back empty.
		load_async_ai_overview: true,
	});

	// One scheduler unit makes one paid live request. A task-level transient
	// failure is recorded and left for the next normal cadence; retrying here
	// would be invisible to the durable attempt ledger.
	const response = await api.googleOrganicLiveAdvanced([requestInfo]);
	const task = response?.tasks?.[0];
	if (task?.status_code !== 20000 || !task.result?.length) {
		throw taskResponseError(task);
	}

	const rawOutput = sanitizeForJson(response);
	await options?.checkpointRawResponse?.({ rawOutput, modelVersion: "dataforseo" });
	// The SERP response carries the AI Overview as an items[].type
	// "ai_overview" element, which the shared Google extractors understand.
	const citations = extractCitationsFromGoogle(response);
	return {
		rawOutput,
		webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
		textContent: extractTextFromGoogle(response),
		citations,
		modelVersion: "dataforseo",
	};
}

/**
 * Gemini (via DataForSEO) returns each citation `url` as a Google Vertex AI
 * "grounding-api-redirect" link; the real source only appears as a bare domain
 * in the annotation `title`. There is no DataForSEO setting or field that
 * exposes the underlying URL (confirmed against their docs), so we resolve the
 * redirect to its destination. These links are short-lived, so we do it at
 * fetch time and rewrite the raw output in place — both the stored output and
 * the extracted citations then carry the real source URL/domain. ChatGPT and
 * Perplexity already return real URLs and are left untouched; resolution
 * failures fall back to the original redirect URL.
 */
const GROUNDING_REDIRECT_PREFIX = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";

async function resolveGroundingRedirect(url: string): Promise<string> {
	try {
		const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
		const location = res.headers.get("location");
		return location?.startsWith("http") ? location : url;
	} catch {
		return url;
	}
}

async function resolveGroundingRedirects(raw: unknown): Promise<void> {
	type RawAnnotation = { url?: string };
	type RawLlmResponse = {
		tasks?: { result?: { items?: { sections?: { annotations?: RawAnnotation[] }[] }[] }[] }[];
	};
	const items = (raw as RawLlmResponse)?.tasks?.[0]?.result?.[0]?.items ?? [];
	const redirected: RawAnnotation[] = [];
	for (const item of items) {
		for (const section of item?.sections ?? []) {
			for (const ann of section?.annotations ?? []) {
				if (typeof ann?.url === "string" && ann.url.startsWith(GROUNDING_REDIRECT_PREFIX)) {
					redirected.push(ann);
				}
			}
		}
	}
	if (redirected.length === 0) return;
	const resolved = new Map<string, string>();
	await Promise.all(
		[...new Set(redirected.map((a) => a.url as string))].map(async (u) =>
			resolved.set(u, await resolveGroundingRedirect(u)),
		),
	);
	for (const ann of redirected) {
		ann.url = resolved.get(ann.url as string) ?? ann.url;
	}
}

async function runLlmResponse(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const spec = LLM_MODELS[model];
	const api = createDfsAiApi();
	const modelName = options?.version ?? spec.defaultModelName;
	const webSearch = options?.webSearch ?? false;

	const body: DataForSeoLlmRequest = {
		user_prompt: prompt,
		model_name: modelName,
		web_search: webSearch,
	};
	// Do not expose country localization yet: DataForSEO's LLM Responses
	// support differs by surface/model (ChatGPT has model caveats, Perplexity
	// only documents it for Sonar models, and Gemini does not document it).

	const response = await LLM_CALLS[spec.call](api, [body]);

	if (!response?.tasks?.length) {
		throw taskResponseError(null);
	}

	const task = response.tasks[0];
	if (task.status_code !== 20000 || !task.result?.length) {
		throw taskResponseError(task);
	}

	const result = task.result[0];
	const raw = sanitizeForJson(response);
	const modelVersion = result.model_name ?? modelName;
	await options?.checkpointRawResponse?.({ rawOutput: raw, modelVersion });
	// Replace Gemini's Vertex grounding-redirect citation URLs with the real
	// source URLs on a separate extraction copy (no-op for ChatGPT/Perplexity).
	// The durable raw output remains the exact JSON-safe provider response.
	const extractionRaw = sanitizeForJson(raw);
	await resolveGroundingRedirects(extractionRaw);
	const citations = extractCitationsFromDataforseoLlm(extractionRaw);
	// DataForSEO exposes the LLM's expanded queries as fan_out_queries. Surface
	// them as webQueries when web search was on; otherwise fall back to the
	// "unavailable" marker when citations prove a search occurred.
	const fanOut: string[] = Array.isArray(result.fan_out_queries)
		? result.fan_out_queries.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
		: [];

	return {
		rawOutput: raw,
		webQueries: webSearch ? (fanOut.length > 0 ? fanOut : citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : []) : [],
		textContent: extractTextFromDataforseoLlm(extractionRaw),
		citations,
		modelVersion,
	};
}

async function runLlmScraper(
	model: keyof typeof SCRAPER_CALLS,
	prompt: string,
	options?: ProviderOptions,
): Promise<ScrapeResult> {
	const response = await SCRAPER_CALLS[model](createDfsAiApi(), prompt);

	if (!response?.tasks?.length) {
		throw taskResponseError(null);
	}

	const task = response.tasks[0];
	if (task.status_code !== 20000 || !task.result?.length) {
		throw taskResponseError(task);
	}

	const result = task.result[0];
	const raw = sanitizeForJson(response);
	const modelVersion = result.model ?? model;
	await options?.checkpointRawResponse?.({ rawOutput: raw, modelVersion });
	const citations = extractCitationsFromDataforseoScraper(raw);

	// ChatGPT reports its expanded queries as fan_out_queries; Gemini's scraper
	// response has no equivalent field, so it falls back to the "unavailable"
	// marker once citations prove a search ran.
	const fanOut: string[] = Array.isArray(result.fan_out_queries)
		? result.fan_out_queries.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
		: [];

	return {
		rawOutput: raw,
		webQueries: fanOut.length > 0 ? fanOut : citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
		textContent: extractTextFromDataforseoScraper(raw),
		citations,
		modelVersion,
	};
}

export const dataforseo: Provider = {
	id: "dataforseo",
	name: "DataForSEO",

	isConfigured: isDataforseoConfigured,

	validateTarget(config: ModelConfig) {
		if (!SUPPORTED_MODELS.has(config.model)) {
			return `DataForSEO only supports: ${[...SUPPORTED_MODELS].join(", ")}`;
		}
		// A version slug pins the LLM Responses model_name, which only that route
		// accepts — the SERP and scraper endpoints serve whatever the live surface
		// returns, so a pin there would silently do nothing.
		if (config.version && !LLM_MODELS[config.model]) {
			return `${config.model}:dataforseo does not accept a version slug — that surface is scraped, not requested by model (got "${config.version}")`;
		}
		// Google AI Mode is search-only. The chatbot engines model the UX where web
		// search is always on, so :online is required there too (matches the
		// BrightData provider for these engines).
		if (!config.webSearch) {
			return `${config.model}:dataforseo requires :online — this engine always uses web search`;
		}
		return null;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		assertPromptLength(prompt);
		if (SERP_MODELS.has(model)) {
			return runGoogleAiMode(prompt, options);
		}
		if (model === AI_OVERVIEW_MODEL) {
			return runGoogleAiOverview(prompt, options);
		}
		// Prefer the scraped consumer UI. Pinning a model_name is the opt-in to the
		// LLM Responses API, which is the only route that can honor one.
		if (!options?.version && model in SCRAPER_CALLS) {
			return runLlmScraper(model as keyof typeof SCRAPER_CALLS, prompt, options);
		}
		if (LLM_MODELS[model]) {
			return runLlmResponse(model, prompt, options);
		}
		throw new ProviderRunRejectedError(
			`DataForSEO: unsupported model "${model}". Supported: ${[...SUPPORTED_MODELS].join(", ")}`,
		);
	},
};
