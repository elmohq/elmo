import * as client from "dataforseo-client";
import {
	extractCitationsFromDataforseoLlm,
	extractCitationsFromDataforseoScraper,
	extractCitationsFromGoogle,
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

/** Always search, and answer SERP-shaped (items[].type "ai_overview"). */
const SERP_MODELS = new Set(["google-ai-mode"]);

/**
 * LLM Responses API. ChatGPT and Gemini only come here when a target pins a
 * version slug; Perplexity has no scraper, so it always does.
 */
const LLM_MODELS: Record<string, { defaultModelName: string; call: keyof typeof LLM_CALLS }> = {
	// gpt-5.5 is the model behind ChatGPT's current default ("GPT-5.5 Instant").
	// DataForSEO's `*-chat-latest` aliases lag the consumer product, so we pin a
	// concrete current model and bump it as ChatGPT advances.
	chatgpt: { defaultModelName: "gpt-5.5", call: "chatgpt" },
	perplexity: { defaultModelName: "sonar", call: "perplexity" },
	gemini: { defaultModelName: "gemini-2.5-flash", call: "gemini" },
};

/** LLM Scraper API: the default route, since it drives the real consumer products. */
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

// AI Overview comes from the Organic SERP endpoint, not AI Mode's, so it has its own runner.
const AI_OVERVIEW_MODEL = "google-ai-overview";
const SUPPORTED_MODELS = new Set([...SERP_MODELS, AI_OVERVIEW_MODEL, ...Object.keys(LLM_MODELS)]);

/** Must agree with `run()`'s dispatch: the settings page labels targets from it. */
function dataforseoAccess({ model, version }: ModelConfig): ProviderAccess {
	if (SERP_MODELS.has(model) || model === AI_OVERVIEW_MODEL) return "scraped";
	return !version && model in SCRAPER_CALLS ? "scraped" : "api";
}

interface DataForSeoLlmRequest {
	user_prompt: string;
	model_name: string;
	web_search: boolean;
}

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

	// Async AI Overview loads intermittently fail with "Internal SE Server Error";
	// a couple of retries clear it.
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

		const citations = extractCitationsFromGoogle(response);
		return {
			result: {
				rawOutput: sanitizeForJson(response),
				webQueries: reportedWebQueries([], { searchProven: citations.length > 0 }),
				modelVersion: "dataforseo",
			},
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Gemini's citation URLs are short-lived Vertex AI redirects, and DataForSEO
 * exposes no real URL, so they are resolved at fetch time and rewritten in the
 * raw output. A failed resolution keeps the redirect.
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
	await resolveGroundingRedirects(raw);
	const citations = extractCitationsFromDataforseoLlm(raw);

	return {
		rawOutput: raw,
		webQueries: reportedWebQueries(fanOutQueries(result), { webSearch, searchProven: citations.length > 0 }),
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
		modelVersion: result.model ?? model,
	};
}

export const dataforseo: Provider = {
	id: "dataforseo",
	name: "DataForSEO",
	access: "scraped",
	accessFor: dataforseoAccess,
	docsAnchor: "dataforseo",

	isConfigured: isDataforseoConfigured,

	validateTarget(config: ModelConfig) {
		if (!SUPPORTED_MODELS.has(config.model)) {
			return `DataForSEO only supports: ${[...SUPPORTED_MODELS].join(", ")}`;
		}
		if (config.version && !LLM_MODELS[config.model]) {
			return `${config.model}:dataforseo does not accept a version slug — that surface is scraped, not requested by model (got "${config.version}")`;
		}
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
		if (!options?.version && model in SCRAPER_CALLS) {
			return runLlmScraper(model as keyof typeof SCRAPER_CALLS, prompt);
		}
		if (LLM_MODELS[model]) {
			return runLlmResponse(model, prompt, options);
		}
		throw new Error(`DataForSEO: unsupported model "${model}". Supported: ${[...SUPPORTED_MODELS].join(", ")}`);
	},
};
