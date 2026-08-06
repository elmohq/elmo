import * as client from "dataforseo-client";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { extractCitationsFromDataforseoScraper, extractTextFromDataforseoScraper } from "../../text-extraction";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import {
	assertPromptLength,
	createDfsAiApi,
	DFS_LANGUAGE_CODE,
	DFS_LOCATION_CODE,
	isDataforseoConfigured,
	sanitizeForJson,
} from "./dataforseo-shared";

/**
 * DataForSEO's AI Optimization "LLM Scraper" API, which drives the real
 * chatgpt.com / gemini.google.com interfaces rather than the vendors' model
 * APIs (that's the sibling `dataforseo` provider's LLM Responses endpoints).
 * The tradeoff: answers match what a consumer actually sees, but the served
 * model is whatever the live product picks, so there is no model_name to set.
 *
 * Perplexity has no scraper endpoint — it stays on `perplexity:dataforseo`.
 */
const SCRAPER_MODELS = {
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

const SUPPORTED_MODELS = Object.keys(SCRAPER_MODELS);

export const dataforseoScraper: Provider = {
	id: "dataforseo-scraper",
	name: "DataForSEO Scraper",

	isConfigured: isDataforseoConfigured,

	validateTarget(config: ModelConfig) {
		if (!(config.model in SCRAPER_MODELS)) {
			return `DataForSEO Scraper only supports: ${SUPPORTED_MODELS.join(", ")}`;
		}
		// The scraper returns whatever model the live product serves, so a version
		// slug would silently do nothing. Reject it rather than ignore it.
		if (config.version) {
			return `${config.model}:dataforseo-scraper does not accept a version slug — the live UI picks the model (got "${config.version}")`;
		}
		if (!config.webSearch) {
			return `${config.model}:dataforseo-scraper requires :online — this engine always uses web search`;
		}
		return null;
	},

	async run(model: string, prompt: string, _options?: ProviderOptions): Promise<ScrapeResult> {
		assertPromptLength(prompt);
		const call = SCRAPER_MODELS[model as keyof typeof SCRAPER_MODELS];
		if (!call) {
			throw new Error(`DataForSEO Scraper: unsupported model "${model}". Supported: ${SUPPORTED_MODELS.join(", ")}`);
		}

		const response = await call(createDfsAiApi(), prompt);

		if (!response?.tasks?.length) {
			throw new Error(`DataForSEO API Error: No response or tasks.`);
		}

		const task = response.tasks[0];
		if (task.status_code !== 20000 || !task.result?.length) {
			throw new Error(`DataForSEO API Error: ${task.status_code} ${task.status_message}`);
		}

		const result = task.result[0];
		const raw = sanitizeForJson(response);
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
			modelVersion: result.model ?? model,
		};
	},
};
