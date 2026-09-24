import * as client from "dataforseo-client";
import {
	extractCitationsFromDataforseoLlm,
	extractCitationsFromDataforseoScraper,
	extractCitationsFromGoogle,
	extractTextFromDataforseoLlm,
	extractTextFromDataforseoScraper,
	extractTextFromGoogle,
} from "../../text-extraction";
import { reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderAccess, ProviderOptions, ScrapeResult } from "../types";
import {
	assertPromptLength,
	createDfsAiApi,
	createDfsSerpApi,
	DFS_LANGUAGE_CODE,
	DFS_LOCATION_CODE,
	dfsFirstResult,
	dfsResultOrError,
	fanOutQueries,
	isDataforseoConfigured,
} from "./dataforseo-shared";
import { type Attempt, retryTransient, sanitizeForJson } from "./scrape-shared";

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

/**
 * Which route a target takes, mirroring `run()`'s dispatch below: the Google
 * surfaces are always scraped, the LLM Scraper serves the rest until a target
 * pins a model version, which only the LLM Responses API can honor. Read by the
 * settings page, so it has to agree with `run()` — a target labelled "Scraped"
 * that actually asks the model directly describes the wrong thing entirely.
 */
function dataforseoAccess({ model, version }: ModelConfig): ProviderAccess {
	if (SERP_MODELS.has(model) || model === AI_OVERVIEW_MODEL) return "scraped";
	return !version && model in SCRAPER_CALLS ? "scraped" : "api";
}

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

async function runGoogleAiMode(prompt: string): Promise<ScrapeResult> {
	assertPromptLength(prompt);
	const api = createDfsSerpApi();
	const requestInfo = new client.SerpGoogleAiModeLiveAdvancedRequestInfo({
		keyword: prompt,
		location_code: DFS_LOCATION_CODE,
		language_code: DFS_LANGUAGE_CODE,
		depth: 10,
	});

	const response = await api.googleAiModeLiveAdvanced([requestInfo]);
	dfsFirstResult(response);

	const citations = extractCitationsFromGoogle(response);
	// Google AI Mode always searches, but DataForSEO doesn't expose the query
	// strings anywhere in its response. Mark "unavailable" when citations
	// prove a search, like the other providers; never echo the prompt as a query.
	return {
		rawOutput: sanitizeForJson(response),
		webQueries: reportedWebQueries([], { searchProven: citations.length > 0 }),
		textContent: extractTextFromGoogle(response),
		citations,
		modelVersion: "dataforseo",
	};
}

function runGoogleAiOverview(prompt: string): Promise<ScrapeResult> {
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

	// Loading the AI Overview asynchronously intermittently fails on DataForSEO's
	// side with a task-level "Internal SE Server Error"; a couple of retries clear
	// it, so a transient blip doesn't fail the run (matches the BrightData AI
	// Overview runner).
	return retryTransient(
		() => attemptGoogleAiOverview(api, requestInfo),
		(lastError) => `DataForSEO API Error: ${lastError}`,
	);
}

async function attemptGoogleAiOverview(
	api: ReturnType<typeof createDfsSerpApi>,
	requestInfo: client.SerpGoogleOrganicLiveAdvancedRequestInfo,
): Promise<Attempt<ScrapeResult>> {
	try {
		const response = await api.googleOrganicLiveAdvanced([requestInfo]);
		const outcome = dfsResultOrError(response);
		if ("error" in outcome) return outcome;

		// The SERP response carries the AI Overview as an items[].type
		// "ai_overview" element, which the shared Google extractors understand.
		const citations = extractCitationsFromGoogle(response);
		return {
			result: {
				rawOutput: sanitizeForJson(response),
				webQueries: reportedWebQueries([], { searchProven: citations.length > 0 }),
				textContent: extractTextFromGoogle(response),
				citations,
				modelVersion: "dataforseo",
			},
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
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

type RawAnnotation = { url?: string };
type RawLlmResponse = {
	tasks?: { result?: { items?: { sections?: { annotations?: RawAnnotation[] }[] }[] }[] }[];
};

function collectGroundingAnnotations(raw: unknown): RawAnnotation[] {
	const items = (raw as RawLlmResponse)?.tasks?.[0]?.result?.[0]?.items ?? [];
	const annotations = items.flatMap((item) => (item?.sections ?? []).flatMap((section) => section?.annotations ?? []));
	return annotations.filter((ann) => typeof ann?.url === "string" && ann.url.startsWith(GROUNDING_REDIRECT_PREFIX));
}

async function resolveGroundingRedirects(raw: unknown): Promise<void> {
	const redirected = collectGroundingAnnotations(raw);
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
	const result = dfsFirstResult<{ model_name?: string; fan_out_queries?: unknown }>(response);
	const raw = sanitizeForJson(response);
	// Replace Gemini's Vertex grounding-redirect citation URLs with the real
	// source URLs before extraction (no-op for ChatGPT/Perplexity).
	await resolveGroundingRedirects(raw);
	const citations = extractCitationsFromDataforseoLlm(raw);

	return {
		rawOutput: raw,
		webQueries: reportedWebQueries(fanOutQueries(result), { webSearch, searchProven: citations.length > 0 }),
		textContent: extractTextFromDataforseoLlm(raw),
		citations,
		modelVersion: result.model_name ?? modelName,
	};
}

async function runLlmScraper(model: keyof typeof SCRAPER_CALLS, prompt: string): Promise<ScrapeResult> {
	const response = await SCRAPER_CALLS[model](createDfsAiApi(), prompt);
	const result = dfsFirstResult<{ model?: string; fan_out_queries?: unknown }>(response);
	const raw = sanitizeForJson(response);
	const citations = extractCitationsFromDataforseoScraper(raw);

	return {
		rawOutput: raw,
		// Gemini's scraper response carries no fan_out_queries field.
		webQueries: reportedWebQueries(fanOutQueries(result), { searchProven: citations.length > 0 }),
		textContent: extractTextFromDataforseoScraper(raw),
		citations,
		modelVersion: result.model ?? model,
	};
}

export const dataforseo: Provider = {
	id: "dataforseo",
	name: "DataForSEO",
	access: "scraped",
	// A pinned version routes to LLM Responses; without one the surface is scraped.
	accessFor: dataforseoAccess,
	docsAnchor: "dataforseo",

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
			return runGoogleAiMode(prompt);
		}
		if (model === AI_OVERVIEW_MODEL) {
			return runGoogleAiOverview(prompt);
		}
		// Prefer the scraped consumer UI. Pinning a model_name is the opt-in to the
		// LLM Responses API, which is the only route that can honor one.
		if (!options?.version && model in SCRAPER_CALLS) {
			return runLlmScraper(model as keyof typeof SCRAPER_CALLS, prompt);
		}
		if (LLM_MODELS[model]) {
			return runLlmResponse(model, prompt, options);
		}
		throw new Error(`DataForSEO: unsupported model "${model}". Supported: ${[...SUPPORTED_MODELS].join(", ")}`);
	},
};
