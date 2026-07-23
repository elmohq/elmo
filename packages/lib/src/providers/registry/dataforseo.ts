import * as client from "dataforseo-client";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import {
	extractCitationsFromDataforseoLlm,
	extractCitationsFromGoogle,
	extractTextFromDataforseoLlm,
	extractTextFromGoogle,
} from "../../text-extraction";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import { getCredential } from "../../secrets";

/**
 * Models served via the SERP Google AI Mode endpoint (SerpApi). These always
 * use web search and have a SERP-shaped response (items[].type "ai_overview").
 */
const SERP_MODELS = new Set(["google-ai-mode"]);

/**
 * Models served via the AI Optimization "LLM Responses" API
 * (chat_gpt / perplexity / gemini), mapping each Elmo model id to the
 * AiOptimizationApi live method plus a sensible default DataForSEO model_name.
 * The model_name can be overridden per target via the version slug, e.g.
 * `chatgpt:dataforseo:gpt-4.1:online`.
 */
const LLM_MODELS: Record<string, { defaultModelName: string; call: keyof typeof LLM_CALLS }> = {
	// gpt-5.5 is the model behind ChatGPT's current default ("GPT-5.5 Instant").
	// DataForSEO's `*-chat-latest` aliases lag the consumer product, so we pin a
	// concrete current model and bump it as ChatGPT advances.
	chatgpt: { defaultModelName: "gpt-5.5", call: "chatgpt" },
	perplexity: { defaultModelName: "sonar", call: "perplexity" },
	gemini: { defaultModelName: "gemini-2.5-flash", call: "gemini" },
};

// Google AI Overview is the AI summary block on a standard Google results page.
// It comes from the Organic SERP endpoint (not AI Mode's dedicated SERP), so it
// gets its own runner rather than joining SERP_MODELS.
const AI_OVERVIEW_MODEL = "google-ai-overview";
const SUPPORTED_MODELS = new Set([...SERP_MODELS, AI_OVERVIEW_MODEL, ...Object.keys(LLM_MODELS)]);
const MAX_PROMPT_CHARS = 500;

interface DataForSeoLlmRequest {
	user_prompt: string;
	model_name: string;
	web_search: boolean;
}

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

function authFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
	const username = getCredential("DATAFORSEO_LOGIN");
	const password = getCredential("DATAFORSEO_PASSWORD");
	if (!username || !password) {
		throw new Error("DataForSEO requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD");
	}
	const token = btoa(`${username}:${password}`);
	return fetch(url, {
		...init,
		headers: { ...init?.headers, Authorization: `Basic ${token}`, "Content-Type": "application/json" },
	});
}

function createDfsSerpApi() {
	return new client.SerpApi("https://api.dataforseo.com", { fetch: authFetch });
}

function createDfsAiApi() {
	return new client.AiOptimizationApi("https://api.dataforseo.com", { fetch: authFetch });
}

function assertPromptLength(prompt: string) {
	const length = Array.from(prompt).length;
	if (length > MAX_PROMPT_CHARS) {
		throw new Error(`DataForSEO prompts must be ${MAX_PROMPT_CHARS} characters or fewer (${length} provided)`);
	}
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
		location_code: 2840,
		language_code: "en",
		depth: 10,
	});

	const response = await api.googleAiModeLiveAdvanced([requestInfo]);

	if (!response?.tasks?.length) {
		throw new Error(`DataForSEO API Error: No response or tasks.`);
	}

	const task = response.tasks[0];
	if (task.status_code !== 20000 || !task.result?.length) {
		throw new Error(`DataForSEO API Error: ${task.status_message}`);
	}

	const citations = extractCitationsFromGoogle(response);
	// Google AI Mode always searches, but DataForSEO doesn't expose the query
	// strings anywhere in its response. Mark "unavailable" when citations
	// prove a search, like the other providers; never echo the prompt (runs
	// before this change did).
	return {
		rawOutput: sanitizeForJson(response),
		webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
		textContent: extractTextFromGoogle(response),
		citations,
		modelVersion: "dataforseo",
	};
}

async function runGoogleAiOverview(prompt: string): Promise<ScrapeResult> {
	assertPromptLength(prompt);
	const api = createDfsSerpApi();
	const requestInfo = new client.SerpGoogleOrganicLiveAdvancedRequestInfo({
		keyword: prompt,
		location_code: 2840,
		language_code: "en",
		depth: 10,
		// AI Overviews are generated on demand; without this DataForSEO only
		// returns whatever it had cached, so most runs would come back empty.
		load_async_ai_overview: true,
	});

	// Loading the AI Overview asynchronously intermittently fails on DataForSEO's
	// side with a task-level "Internal SE Server Error"; a couple of retries clear
	// it, so a transient blip doesn't fail the run (matches the BrightData AI
	// Overview runner).
	let lastError = "No response or tasks.";
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await api.googleOrganicLiveAdvanced([requestInfo]);
			const task = response?.tasks?.[0];
			if (task?.status_code === 20000 && task.result?.length) {
				// The SERP response carries the AI Overview as an items[].type
				// "ai_overview" element, which the shared Google extractors understand.
				const citations = extractCitationsFromGoogle(response);
				return {
					rawOutput: sanitizeForJson(response),
					webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
					textContent: extractTextFromGoogle(response),
					citations,
					modelVersion: "dataforseo",
				};
			}
			lastError = task ? `${task.status_code} ${task.status_message}` : "No response or tasks.";
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
	}
	throw new Error(`DataForSEO API Error: ${lastError}`);
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
		throw new Error(`DataForSEO API Error: No response or tasks.`);
	}

	const task = response.tasks[0];
	if (task.status_code !== 20000 || !task.result?.length) {
		throw new Error(`DataForSEO API Error: ${task.status_code} ${task.status_message}`);
	}

	const result = task.result[0];
	const raw = sanitizeForJson(response);
	// Replace Gemini's Vertex grounding-redirect citation URLs with the real
	// source URLs before extraction (no-op for ChatGPT/Perplexity).
	await resolveGroundingRedirects(raw);
	const citations = extractCitationsFromDataforseoLlm(raw);
	// DataForSEO exposes the LLM's expanded queries as fan_out_queries. Surface
	// them as webQueries when web search was on; otherwise fall back to the
	// "unavailable" marker when citations prove a search occurred.
	const fanOut: string[] = Array.isArray(result.fan_out_queries)
		? result.fan_out_queries.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
		: [];

	return {
		rawOutput: raw,
		webQueries: webSearch ? (fanOut.length > 0 ? fanOut : citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : []) : [],
		textContent: extractTextFromDataforseoLlm(raw),
		citations,
		modelVersion: result.model_name ?? modelName,
	};
}

export const dataforseo: Provider = {
	id: "dataforseo",
	name: "DataForSEO",

	isConfigured() {
		return !!getCredential("DATAFORSEO_LOGIN") && !!getCredential("DATAFORSEO_PASSWORD");
	},

	validateTarget(config: ModelConfig) {
		if (!SUPPORTED_MODELS.has(config.model)) {
			return `DataForSEO only supports: ${[...SUPPORTED_MODELS].join(", ")}`;
		}
		// Google AI Mode is search-only. The LLM Responses engines model the
		// chatbot UX where web search is always on, so :online is required there
		// too (matches the BrightData provider for these engines).
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
		if (LLM_MODELS[model]) {
			return runLlmResponse(model, prompt, options);
		}
		throw new Error(`DataForSEO: unsupported model "${model}". Supported: ${[...SUPPORTED_MODELS].join(", ")}`);
	},
};
