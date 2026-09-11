import { getCredential } from "../../secrets";
import { type Citation, extractCitationsFromSearchapi, extractTextFromSearchapi } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import { type Attempt, isTransientStatus, nonEmptyStrings, responseError, retryTransient } from "./scrape-shared";

const SEARCHAPI_URL = "https://www.searchapi.io/api/v1/search";

// SearchApi localizes every surface it can; default to a US audience.
const GOOGLE_LOCALE = { gl: "us", hl: "en" } as const;

const SEARCHAPI_TIMEOUT_MS = 3 * 60 * 1000;

type SearchapiTarget = {
	engine: string;
	params?: Record<string, string>;
	nested?: "ai_overview";
};

// AI Overview rides on the SERP engine because the dedicated one needs a
// page_token that only a SERP call mints, making it two searches instead of one.
const SEARCHAPI_TARGETS: Record<string, SearchapiTarget> = {
	chatgpt: { engine: "chatgpt" },
	perplexity: { engine: "perplexity" },
	copilot: { engine: "bing_copilot" },
	gemini: { engine: "gemini" },
	"google-ai-mode": { engine: "google_ai_mode", params: { ...GOOGLE_LOCALE } },
	"google-ai-overview": { engine: "google", params: { ...GOOGLE_LOCALE, link: "resolved" }, nested: "ai_overview" },
};

// Perplexity's gate, which SearchApi passes through as a successful search.
const PERPLEXITY_SIGNUP_WALL = "sign up and repeat your request.";

async function attemptSearch(params: URLSearchParams): Promise<Attempt<Record<string, any>>> {
	let res: Response;
	try {
		res = await fetch(`${SEARCHAPI_URL}?${params}`, {
			headers: { Authorization: `Bearer ${getCredential("SEARCHAPI_API_KEY")}` },
			signal: AbortSignal.timeout(SEARCHAPI_TIMEOUT_MS),
		});
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}

	if (isTransientStatus(res.status)) return { error: await responseError(res) };
	if (!res.ok) throw new Error(`SearchApi request failed (${await responseError(res)})`);

	const body = (await res.json()) as Record<string, any>;
	if (body?.error) throw new Error(`SearchApi request failed (${String(body.error).slice(0, 500)})`);
	return { result: body };
}

function hasAnswerBody(answer: Record<string, any>): boolean {
	if (typeof answer.markdown === "string" && answer.markdown.trim()) return true;
	return Array.isArray(answer.text_blocks) && answer.text_blocks.length > 0;
}

// A shell with no answer in it — Google handing back an ai_overview.page_token
// instead of the overview — fails rather than storing as a run nobody was
// mentioned in.
function readAnswer(payload: Record<string, any>, target: SearchapiTarget): Record<string, any> {
	const answer = target.nested ? payload[target.nested] : payload;
	if (!answer || typeof answer !== "object") {
		throw new Error(
			target.nested
				? "SearchApi returned a Google result page with no AI Overview block"
				: `SearchApi returned an empty ${target.engine} response`,
		);
	}
	if (typeof answer.markdown === "string" && answer.markdown.trim().toLowerCase() === PERPLEXITY_SIGNUP_WALL) {
		throw new Error("SearchApi returned Perplexity's sign-up wall instead of an answer");
	}
	if (!hasAnswerBody(answer)) {
		const detail = typeof answer.error === "string" ? `: ${answer.error.slice(0, 200)}` : "";
		throw new Error(`SearchApi returned no ${target.engine} answer${detail}`);
	}
	return answer;
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
		if (model === "chatgpt" && (options?.webSearch ?? false)) params.set("web_search", "true");

		const payload = await retryTransient(
			() => attemptSearch(params),
			(lastError) => `SearchApi request failed after retries (${lastError})`,
		);

		const answer = readAnswer(payload, target);
		const stored = storedOutput(payload, target);
		const citations: Citation[] = extractCitationsFromSearchapi(stored);

		return {
			rawOutput: stored,
			textContent: extractTextFromSearchapi(stored),
			// ChatGPT searches on its own initiative too, so trust what the response
			// reports over the target's toggle. No other engine sets the field.
			webQueries: reportedWebQueries(nonEmptyStrings(answer.search_queries), {
				webSearch: answer.response_metadata?.is_web_search_performed !== false,
				searchProven: citations.length > 0,
			}),
			citations,
			modelVersion: typeof answer.response_metadata?.model === "string" ? answer.response_metadata.model : undefined,
		};
	},
};
