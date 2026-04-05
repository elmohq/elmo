import * as client from "dataforseo-client";
import { extractTextFromGoogle, extractCitationsFromGoogle } from "../text-extraction";
import type { Provider, ScrapeResult, ProviderOptions } from "./types";

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

		return {
			rawOutput: sanitizeForJson(response),
			webQueries: [prompt],
			textContent: extractTextFromGoogle(response),
			citations: extractCitationsFromGoogle(response),
			modelVersion: "dataforseo",
		};
	},
};
