import { z } from "zod";
import { getCredential } from "../../secrets";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, reportedWebQueries, warnIfOutputCapped } from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { parseSchemaJson } from "./ai-sdk";

// Mainland-China accounts live on open.bigmodel.cn and GLM Coding Plan keys on
// /api/coding/paas/v4; neither accepts a key issued for the other, so the host
// is overridable rather than guessed.
const DEFAULT_ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_MODEL = "glm-5.2";
// glm-5.2 rather than the newer glm-5.3 because 5.3 cannot turn thinking off,
// and with it on the answer can land in reasoning_content instead of content.
const DEFAULT_RESEARCH_MODEL = "glm-5.2";
/** Results the web_search tool feeds the model per tracked run (billed per search, not per result). */
const ZAI_WEB_SEARCH_COUNT = 10;

function zaiBaseUrl(): string {
	return (process.env.ZAI_BASE_URL?.trim() || DEFAULT_ZAI_BASE_URL).replace(/\/+$/, "");
}

async function zaiChat(body: object): Promise<any> {
	const res = await fetch(`${zaiBaseUrl()}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getCredential("ZAI_API_KEY")}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`Z.ai API error (${res.status}): ${await res.text()}`);
	}
	return res.json();
}

// `search_result: true` is what makes the response carry the top-level
// `web_search` array that citations are read from.
function webSearchTool(count: number) {
	return {
		type: "web_search",
		web_search: { enable: true, search_engine: "search-prime", search_result: true, count },
	};
}

/**
 * GLM's JSON mode is `json_object` only — there is no server-enforced
 * json_schema — so the schema rides along in the prompt and the reply is
 * validated client-side.
 */
function withSchemaInstructions(prompt: string, schema: z.ZodType): string {
	return `${prompt}\n\nRespond with a single JSON object, and nothing else, that conforms to this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
}

export const zaiApi: Provider = {
	id: "zai-api",
	name: "Z.ai API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("ZAI_API_KEY"),

	async run(_model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_MODEL;
		const webSearch = options?.webSearch ?? false;
		const data = await zaiChat({
			model: version,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["zai-api"],
			...(webSearch ? { tools: [webSearchTool(ZAI_WEB_SEARCH_COUNT)] } : {}),
		});
		warnIfOutputCapped("zai-api", version, data?.choices?.[0]?.finish_reason);
		// Z.ai returns the pages it searched but never the query it searched for.
		const searched = Array.isArray(data?.web_search) && data.web_search.length > 0;
		return {
			rawOutput: data,
			webQueries: reportedWebQueries([], { webSearch, searchProven: searched }),
			modelVersion: data?.model ?? version,
		};
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const data = await zaiChat({
			model: DEFAULT_RESEARCH_MODEL,
			messages: [{ role: "user", content: withSchemaInstructions(prompt, schema) }],
			response_format: { type: "json_object" },
			thinking: { type: "disabled" },
			...(webSearch ? { tools: [webSearchTool(ZAI_WEB_SEARCH_COUNT)] } : {}),
		});
		const content = data?.choices?.[0]?.message?.content;
		if (typeof content !== "string" || !content.trim()) {
			throw new Error(`Z.ai returned no JSON content (model=${DEFAULT_RESEARCH_MODEL})`);
		}
		return {
			object: parseSchemaJson(schema, content),
			modelVersion: data?.model ?? DEFAULT_RESEARCH_MODEL,
		};
	},
};
