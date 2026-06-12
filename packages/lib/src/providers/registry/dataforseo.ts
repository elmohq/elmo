import * as client from "dataforseo-client";
import { extractTextFromGoogle, extractCitationsFromGoogle } from "../../text-extraction";
import type { Provider, ScrapeResult, ProviderOptions, ModelConfig } from "../types";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";

const SUPPORTED_MODELS = new Set(["google-ai-mode"]);

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

function createDfsSerpApi() {
	const username = process.env.DATAFORSEO_LOGIN!;
	const password = process.env.DATAFORSEO_PASSWORD!;
	const authFetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const token = btoa(`${username}:${password}`);
		return fetch(url, {
			...init,
			headers: { ...init?.headers, Authorization: `Basic ${token}`, "Content-Type": "application/json" },
		});
	};
	return new client.SerpApi("https://api.dataforseo.com", { fetch: authFetch });
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
		if (!config.webSearch) {
			return `${config.model}:dataforseo requires :online — Google AI Mode always uses web search`;
		}
		return null;
	},

	async run(model: string, prompt: string, _options?: ProviderOptions): Promise<ScrapeResult> {
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
	},
};
