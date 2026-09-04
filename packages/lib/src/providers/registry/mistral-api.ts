import { getCredential } from "../../secrets";
import { type Citation, extractCitationsFromMistral } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, warnIfOutputCapped } from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { jsonSchemaResponseFormat, parseSchemaJson } from "./ai-sdk";

const MISTRAL_BASE_URL = "https://api.mistral.ai";
const DEFAULT_MODEL = "mistral-medium-latest";
// `mistral-large-latest` aliases to Mistral Large 3 (released Dec 2025).
// Tracked as `-latest` so the alias rolls forward when newer Large
// generations ship.
const DEFAULT_RESEARCH_MODEL = "mistral-large-latest";

async function mistralPost(path: string, body: object): Promise<any> {
	const res = await fetch(`${MISTRAL_BASE_URL}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getCredential("MISTRAL_API_KEY")}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
	}
	return res.json();
}

/** A payload field that should hold a list but may be missing or malformed. */
function asList(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Search queries the model ran. Tool-execution entries carry the query as a
 * JSON-encoded string in `arguments` — best-effort, since webQueries is a
 * reporting signal and a malformed payload shouldn't fail the response.
 */
function conversationWebQueries(data: any): string[] {
	const queries: string[] = [];
	for (const entry of asList(data?.outputs)) {
		if (entry?.type !== "tool.execution" || entry?.name !== "web_search") continue;
		try {
			const args = JSON.parse(entry.arguments);
			if (args?.query) queries.push(args.query);
		} catch {
			// ignore — keep going
		}
	}
	return queries;
}

/**
 * The answer text. Conversations returns message content as either a plain
 * string (single-shot replies) or an array of typed chunks (when tools cite
 * sources).
 */
function conversationText(data: any): string {
	const texts: string[] = [];
	for (const entry of asList(data?.outputs)) {
		if (typeof entry?.content === "string") {
			texts.push(entry.content);
			continue;
		}
		for (const chunk of asList(entry?.content)) {
			if (chunk?.type === "text" && typeof chunk.text === "string") texts.push(chunk.text);
		}
	}
	return texts.join("\n");
}

function parseConversationsResponse(data: any): { textContent: string; citations: Citation[]; webQueries: string[] } {
	return {
		textContent: conversationText(data),
		citations: extractCitationsFromMistral(data),
		webQueries: conversationWebQueries(data),
	};
}

export const mistralApi: Provider = {
	id: "mistral-api",
	name: "Mistral API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("MISTRAL_API_KEY"),

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_MODEL;

		if (options?.webSearch) {
			// Mistral's web_search connector has no per-call search-count knob, so the
			// token cap (completion_args.max_tokens on this endpoint) is the only budget
			// bound. The conversations response carries no finish_reason, so unlike the
			// chat-completions path below there's no truncation signal to log here.
			const data = await mistralPost("/v1/conversations", {
				model: version,
				inputs: prompt,
				tools: [{ type: "web_search" }],
				completion_args: { max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"] },
			});
			const parsed = parseConversationsResponse(data);
			return { ...parsed, rawOutput: data, modelVersion: data?.model ?? version };
		}

		const data = await mistralPost("/v1/chat/completions", {
			model: version,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"],
		});
		warnIfOutputCapped("mistral-api", version, data?.choices?.[0]?.finish_reason);
		return {
			rawOutput: data,
			textContent: data?.choices?.[0]?.message?.content ?? "",
			webQueries: [],
			citations: [],
			modelVersion: data?.model ?? version,
		};
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const responseFormat = jsonSchemaResponseFormat(schema);
		if (!webSearch) {
			// Pure completion: plain chat endpoint with server-validated json_schema.
			const data = await mistralPost("/v1/chat/completions", {
				model: DEFAULT_RESEARCH_MODEL,
				messages: [{ role: "user", content: prompt }],
				response_format: responseFormat,
			});
			return {
				object: parseSchemaJson(schema, data?.choices?.[0]?.message?.content ?? ""),
				modelVersion: data?.model ?? DEFAULT_RESEARCH_MODEL,
			};
		}
		// /v1/conversations forwards completion_args.response_format through to
		// the underlying chat completion, so we can have web_search AND
		// server-validated json_schema output in a single call.
		const data = await mistralPost("/v1/conversations", {
			model: DEFAULT_RESEARCH_MODEL,
			inputs: prompt,
			tools: [{ type: "web_search" }],
			completion_args: { response_format: responseFormat },
		});
		return {
			object: parseSchemaJson(schema, parseConversationsResponse(data).textContent),
			modelVersion: data?.model ?? DEFAULT_RESEARCH_MODEL,
		};
	},
};
