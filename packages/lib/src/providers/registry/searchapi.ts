import { getCredential } from "../../secrets";
import { type Citation, extractCitationsFromSearchapi, searchapiText } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import { type Attempt, failureDetails, isTransientStatus, nonEmptyStrings, retryTransient } from "./scrape-shared";

const SEARCHAPI_URL = "https://www.searchapi.io/api/v1/search";

// SearchApi localizes every surface it can; default to a US audience.
const GOOGLE_LOCALE = { gl: "us", hl: "en" } as const;

const SEARCHAPI_TIMEOUT_MS = 3 * 60 * 1000;

type SearchapiTarget = {
	engine: string;
	params?: Record<string, string>;
	nested?: "ai_overview";
};

// AI Overview rides on the SERP engine: Google inlines the overview on some
// result pages, and on the rest hands back an ai_overview.page_token that only
// the dedicated engine can redeem.
const SEARCHAPI_TARGETS: Record<string, SearchapiTarget> = {
	chatgpt: { engine: "chatgpt" },
	perplexity: { engine: "perplexity" },
	copilot: { engine: "bing_copilot" },
	gemini: { engine: "gemini" },
	"google-ai-mode": { engine: "google_ai_mode", params: { ...GOOGLE_LOCALE } },
	"google-ai-overview": { engine: "google", params: { ...GOOGLE_LOCALE, link: "resolved" }, nested: "ai_overview" },
};

const AI_OVERVIEW_ENGINE = "google_ai_overview";

async function attemptSearch(params: URLSearchParams): Promise<Attempt<Record<string, any>>> {
	let res: Response;
	let raw: string;
	try {
		res = await fetch(`${SEARCHAPI_URL}?${params}`, {
			headers: { Authorization: `Bearer ${getCredential("SEARCHAPI_API_KEY")}` },
			signal: AbortSignal.timeout(SEARCHAPI_TIMEOUT_MS),
		});
		raw = await res.text();
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}

	const detail = `${res.status}: ${raw.slice(0, 500)}`.trim();
	if (isTransientStatus(res.status)) return { error: detail };
	if (!res.ok) throw new Error(`SearchApi request failed (${detail})`);

	let body: Record<string, any>;
	try {
		body = JSON.parse(raw) as Record<string, any>;
	} catch {
		// A 200 that isn't JSON is an edge error page rather than an answer, so it
		// retries instead of failing the run on an opaque parse error.
		return { error: detail };
	}
	if (body?.error) throw new Error(`SearchApi request failed${failureDetails(body.error)}`);
	return { result: body };
}

async function search(params: URLSearchParams): Promise<Record<string, any>> {
	return retryTransient(
		() => attemptSearch(params),
		(lastError) => `SearchApi request failed after retries (${lastError})`,
	);
}

// Tokens expire in under a minute, so this runs straight after the SERP call.
async function redeemAiOverviewToken(payload: Record<string, any>): Promise<Record<string, any>> {
	const overview = payload.ai_overview;
	const pageToken = overview?.page_token;
	if (typeof pageToken !== "string" || !pageToken || searchapiText(overview)) return payload;

	const followUp = await search(
		new URLSearchParams({ engine: AI_OVERVIEW_ENGINE, page_token: pageToken, link: "resolved" }),
	);
	const answer = followUp.ai_overview && typeof followUp.ai_overview === "object" ? followUp.ai_overview : followUp;
	return { ...payload, ai_overview: answer };
}

// A shell with no answer in it — a page token that redeemed to nothing — fails rather than storing as a run nobody was
// mentioned in. The text comes back with it so the run can't be gated on one
// reading of the payload and then stored from another.
function readAnswer(
	payload: Record<string, any>,
	target: SearchapiTarget,
): { answer: Record<string, any>; text: string } {
	const answer = target.nested ? payload[target.nested] : payload;
	if (!answer || typeof answer !== "object") {
		throw new Error(
			target.nested
				? "SearchApi returned a Google result page with no AI Overview block"
				: `SearchApi returned an empty ${target.engine} response`,
		);
	}
	const text = searchapiText(answer);
	if (!text) throw new Error(`SearchApi returned no ${target.engine} answer${failureDetails(answer.error)}`);
	return { answer, text };
}

// The rest of the result page dwarfs the overview and no extractor reads it.
function storedOutput(payload: Record<string, any>, target: SearchapiTarget): Record<string, any> {
	if (!target.nested) return payload;
	return {
		search_metadata: payload.search_metadata,
		search_parameters: payload.search_parameters,
		[target.nested]: payload[target.nested],
	};
}

export const searchapi: Provider = {
	id: "searchapi",
	name: "SearchApi",
	access: "scraped",
	docsAnchor: "searchapi",

	isConfigured: configuredWhen("SEARCHAPI_API_KEY"),

	validateTarget(config: ModelConfig) {
		if (!SEARCHAPI_TARGETS[config.model]) {
			return `SearchApi does not support model "${config.model}". Supported: ${Object.keys(SEARCHAPI_TARGETS).join(", ")}`;
		}
		// ChatGPT is the one surface with a toggle; the rest always search.
		if (config.model !== "chatgpt" && !config.webSearch) {
			return `${config.model}:searchapi requires :online — SearchApi reads the live web-search UIs`;
		}
		return null;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const target = SEARCHAPI_TARGETS[model];
		if (!target) {
			throw new Error(
				`SearchApi: no engine mapping for model "${model}". Supported: ${Object.keys(SEARCHAPI_TARGETS).join(", ")}`,
			);
		}

		const params = new URLSearchParams({ engine: target.engine, q: prompt, ...target.params });
		if (model === "chatgpt") params.set("web_search", String(options?.webSearch ?? false));

		const serp = await search(params);
		const payload = target.nested === "ai_overview" ? await redeemAiOverviewToken(serp) : serp;

		const { answer, text } = readAnswer(payload, target);
		const stored = storedOutput(payload, target);
		const citations: Citation[] = extractCitationsFromSearchapi(stored);

		return {
			rawOutput: stored,
			textContent: text,
			webQueries: reportedWebQueries(nonEmptyStrings(answer.search_queries), {
				webSearch: model !== "chatgpt" || (options?.webSearch ?? false),
				searchProven: citations.length > 0,
			}),
			citations,
			modelVersion: typeof answer.response_metadata?.model === "string" ? answer.response_metadata.model : undefined,
		};
	},
};
