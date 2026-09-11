import * as client from "dataforseo-client";
import { getCredential } from "../../secrets";
import { configuredWhen } from "../config";
import { type Attempt, nonEmptyStrings } from "./scrape-shared";

/**
 * Shared plumbing for the DataForSEO provider, which spans three products on
 * one set of account credentials: the SERP endpoints, AI Optimization "LLM
 * Scraper", and AI Optimization "LLM Responses".
 */

const MAX_PROMPT_CHARS = 500;

// Country localization is intentionally not exposed via SCRAPE_TARGETS yet
// because support differs by DataForSEO surface and underlying model.
export const DFS_LOCATION_CODE = 2840;
export const DFS_LANGUAGE_CODE = "en";

export const isDataforseoConfigured = configuredWhen("DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD");

const DFS_STATUS_OK = 20000;

// Non-generic on purpose: the SDK gives every endpoint its own result class, so
// a generic task type makes a union of two endpoints' responses unassignable.
// The caller names the handful of fields it reads instead.
interface DfsTask {
	status_code?: number;
	status_message?: string;
	result?: unknown[] | null;
}

export interface DfsResponse {
	tasks?: DfsTask[];
}

export function dfsResultOrError<T>(response: DfsResponse | undefined | null): Attempt<T> {
	const task = response?.tasks?.[0];
	if (!task) return { error: "No response or tasks." };
	if (task.status_code !== DFS_STATUS_OK || !task.result?.length) {
		return { error: `${task.status_code} ${task.status_message}` };
	}
	return { result: task.result[0] as T };
}

export function dfsFirstResult<T>(response: DfsResponse | undefined | null): T {
	const outcome = dfsResultOrError<T>(response);
	if ("error" in outcome) throw new Error(`DataForSEO API Error: ${outcome.error}`);
	return outcome.result;
}

export function fanOutQueries(result: { fan_out_queries?: unknown }): string[] {
	return nonEmptyStrings(result.fan_out_queries);
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

export function createDfsSerpApi() {
	return new client.SerpApi("https://api.dataforseo.com", { fetch: authFetch });
}

export function createDfsAiApi() {
	return new client.AiOptimizationApi("https://api.dataforseo.com", { fetch: authFetch });
}

export function assertPromptLength(prompt: string) {
	const length = Array.from(prompt).length;
	if (length > MAX_PROMPT_CHARS) {
		throw new Error(`DataForSEO prompts must be ${MAX_PROMPT_CHARS} characters or fewer (${length} provided)`);
	}
}
