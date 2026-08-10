import { z } from "zod";
import { getCredential } from "../../secrets";
import type { Citation } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, warnIfOutputCapped } from "../config";
import { ProviderTaskFailedError, providerHttpResponseError } from "../errors";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";

const MISTRAL_BASE_URL = "https://api.mistral.ai";
const DEFAULT_MODEL = "mistral-medium-latest";
// `mistral-large-latest` aliases to Mistral Large 3 (released Dec 2025).
// Tracked as `-latest` so the alias rolls forward when newer Large
// generations ship.
const DEFAULT_RESEARCH_MODEL = "mistral-large-latest";

async function mistralPost(path: string, body: object, signal?: AbortSignal): Promise<string> {
	const res = await fetch(`${MISTRAL_BASE_URL}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getCredential("MISTRAL_API_KEY")}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
		signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2 * 60 * 1000)]) : AbortSignal.timeout(2 * 60 * 1000),
	});
	if (!res.ok) {
		const message = `Mistral API error (${res.status}): ${await res.text()}`;
		throw providerHttpResponseError(message, res.status);
	}
	return res.text();
}

function parseConversationsResponse(data: any): { textContent: string; citations: Citation[]; webQueries: string[] } {
	const texts: string[] = [];
	const citations: Citation[] = [];
	const webQueries: string[] = [];
	const seen = new Set<string>();
	let idx = 0;

	for (const entry of data?.outputs ?? []) {
		// Tool-execution entries carry the search query as a JSON-encoded string
		// in `arguments`. Best-effort parse — webQueries is a reporting signal,
		// not load-bearing, so a malformed payload shouldn't blow up the response.
		if (entry?.type === "tool.execution" && entry?.name === "web_search" && typeof entry.arguments === "string") {
			try {
				const args = JSON.parse(entry.arguments);
				if (args?.query) webQueries.push(args.query);
			} catch {
				// ignore — keep going
			}
		}

		// Conversations API returns message content as either a plain string
		// (single-shot replies) or an array of typed chunks (when tools cite sources).
		if (typeof entry?.content === "string") {
			texts.push(entry.content);
			continue;
		}
		for (const chunk of Array.isArray(entry?.content) ? entry.content : []) {
			if (chunk?.type === "text" && typeof chunk.text === "string") {
				texts.push(chunk.text);
			} else if (chunk?.type === "tool_reference" && typeof chunk.url === "string" && !seen.has(chunk.url)) {
				seen.add(chunk.url);
				try {
					citations.push({
						url: chunk.url,
						title: chunk.title ?? undefined,
						domain: new URL(chunk.url).hostname.replace(/^www\./, ""),
						citationIndex: idx++,
					});
				} catch (e) {
					console.warn(`Mistral: skipping invalid citation URL: ${chunk.url}`, e);
				}
			}
		}
	}

	return { textContent: texts.join("\n"), citations, webQueries };
}

export const mistralApi: Provider = {
	id: "mistral-api",
	name: "Mistral API",
	structuredResearchModel: DEFAULT_RESEARCH_MODEL,

	isConfigured() {
		return !!getCredential("MISTRAL_API_KEY");
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_MODEL;

		if (options?.webSearch) {
			// Mistral's web_search connector has no per-call search-count knob, so the
			// token cap (completion_args.max_tokens on this endpoint) is the only budget
			// bound. The conversations response carries no finish_reason, so unlike the
			// chat-completions path below there's no truncation signal to log here.
			const rawResponse = await mistralPost("/v1/conversations", {
				model: version,
				inputs: prompt,
				tools: [{ type: "web_search" }],
				completion_args: { max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"] },
			});
			await options?.checkpointRawResponse?.({ rawOutput: rawResponse, modelVersion: version });
			const data = JSON.parse(rawResponse);
			const modelVersion = data?.model ?? version;
			const parsed = parseConversationsResponse(data);
			return { ...parsed, rawOutput: data, modelVersion };
		}

		const rawResponse = await mistralPost("/v1/chat/completions", {
			model: version,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"],
		});
		await options?.checkpointRawResponse?.({ rawOutput: rawResponse, modelVersion: version });
		const data = JSON.parse(rawResponse);
		const modelVersion = data?.model ?? version;
		warnIfOutputCapped("mistral-api", version, data?.choices?.[0]?.finish_reason);
		return {
			rawOutput: data,
			textContent: data?.choices?.[0]?.message?.content ?? "",
			webQueries: [],
			citations: [],
			modelVersion,
		};
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		signal,
		checkpointResult,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const jsonSchema = z.toJSONSchema(schema as z.ZodType);
		if (!webSearch) {
			// Pure completion: plain chat endpoint with server-validated json_schema.
			const data = JSON.parse(
				await mistralPost(
					"/v1/chat/completions",
					{
						model: DEFAULT_RESEARCH_MODEL,
						messages: [{ role: "user", content: prompt }],
						max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"],
						response_format: {
							type: "json_schema",
							json_schema: { name: "research_output", strict: true, schema: jsonSchema },
						},
					},
					signal,
				),
			);
			const content = data?.choices?.[0]?.message?.content ?? "";
			let object: unknown;
			try {
				object = (schema as z.ZodType).parse(JSON.parse(content));
			} catch (error) {
				throw new ProviderTaskFailedError("Mistral returned invalid structured JSON", { cause: error });
			}
			const structuredResult = {
				object: object as T,
				modelVersion: data?.model ?? DEFAULT_RESEARCH_MODEL,
			};
			await checkpointResult?.(structuredResult);
			return structuredResult;
		}
		// /v1/conversations forwards completion_args.response_format through to
		// the underlying chat completion, so we can have web_search AND
		// server-validated json_schema output in a single call.
		const data = JSON.parse(
			await mistralPost(
				"/v1/conversations",
				{
					model: DEFAULT_RESEARCH_MODEL,
					inputs: prompt,
					tools: [{ type: "web_search" }],
					completion_args: {
						max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"],
						response_format: {
							type: "json_schema",
							json_schema: { name: "research_output", strict: true, schema: jsonSchema },
						},
					},
				},
				signal,
			),
		);
		const { textContent } = parseConversationsResponse(data);
		let object: unknown;
		try {
			object = (schema as z.ZodType).parse(JSON.parse(textContent));
		} catch (error) {
			throw new ProviderTaskFailedError("Mistral returned invalid structured JSON", { cause: error });
		}
		const structuredResult = {
			object: object as T,
			modelVersion: data?.model ?? DEFAULT_RESEARCH_MODEL,
		};
		await checkpointResult?.(structuredResult);
		return structuredResult;
	},
};
