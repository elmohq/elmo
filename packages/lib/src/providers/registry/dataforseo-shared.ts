import * as client from "dataforseo-client";
import { getCredential } from "../../secrets";
import { ProviderRunRejectedError } from "../errors";

/**
 * Shared plumbing for the DataForSEO provider, which spans three products on
 * one set of account credentials: the SERP endpoints, AI Optimization "LLM
 * Scraper", and AI Optimization "LLM Responses".
 */

export const MAX_PROMPT_CHARS = 500;

// Country localization is intentionally not exposed via SCRAPE_TARGETS yet
// because support differs by DataForSEO surface and underlying model.
export const DFS_LOCATION_CODE = 2840;
export const DFS_LANGUAGE_CODE = "en";
const DATAFORSEO_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

export function isDataforseoConfigured(): boolean {
	return !!getCredential("DATAFORSEO_LOGIN") && !!getCredential("DATAFORSEO_PASSWORD");
}

export function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

export function authFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
	const username = getCredential("DATAFORSEO_LOGIN");
	const password = getCredential("DATAFORSEO_PASSWORD");
	if (!username || !password) {
		throw new ProviderRunRejectedError("DataForSEO requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD");
	}
	const token = btoa(`${username}:${password}`);
	const signals = [AbortSignal.timeout(DATAFORSEO_REQUEST_TIMEOUT_MS)];
	if (url instanceof Request) signals.push(url.signal);
	if (init?.signal) signals.push(init.signal);
	return fetch(url, {
		...init,
		headers: { ...init?.headers, Authorization: `Basic ${token}`, "Content-Type": "application/json" },
		signal: AbortSignal.any(signals),
	});
}

export function createDfsSerpApi() {
	return new client.SerpApi("https://api.dataforseo.com", { fetch: authFetch });
}

export function createDfsAiApi() {
	return new client.AiOptimizationApi("https://api.dataforseo.com", { fetch: authFetch });
}

export function assertPromptLength(prompt: string) {
	const length = Array.from(prompt).length;
	if (length > MAX_PROMPT_CHARS) {
		throw new ProviderRunRejectedError(
			`DataForSEO prompts must be ${MAX_PROMPT_CHARS} characters or fewer (${length} provided)`,
		);
	}
}
