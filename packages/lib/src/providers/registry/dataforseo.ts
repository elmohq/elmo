import * as client from "dataforseo-client";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import {
	extractCitationsFromDataforseoLlm,
	extractCitationsFromGoogle,
	extractTextFromDataforseoLlm,
	extractTextFromGoogle,
} from "../../text-extraction";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";

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
	chatgpt: { defaultModelName: "gpt-4o", call: "chatgpt" },
	perplexity: { defaultModelName: "sonar", call: "perplexity" },
	gemini: { defaultModelName: "gemini-2.5-flash", call: "gemini" },
};

const SUPPORTED_MODELS = new Set([...SERP_MODELS, ...Object.keys(LLM_MODELS)]);
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
	const username = process.env.DATAFORSEO_LOGIN;
	const password = process.env.DATAFORSEO_PASSWORD;
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
	chatgpt: (api: client.AiOptimizationApi, body: DataForSeoLlmRequest[]) => api.chatGptLlmResponsesLive(body),
	perplexity: (api: client.AiOptimizationApi, body: DataForSeoLlmRequest[]) => api.perplexityLlmResponsesLive(body),
	gemini: (api: client.AiOptimizationApi, body: DataForSeoLlmRequest[]) => api.geminiLlmResponsesLive(body),
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
		return !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD;
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
		if (LLM_MODELS[model]) {
			return runLlmResponse(model, prompt, options);
		}
		throw new Error(`DataForSEO: unsupported model "${model}". Supported: ${[...SUPPORTED_MODELS].join(", ")}`);
	},
};
