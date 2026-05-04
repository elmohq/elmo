import { z } from "zod";
import type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import type { Citation } from "../../text-extraction";

const MISTRAL_BASE_URL = "https://api.mistral.ai";
const DEFAULT_MODEL = "mistral-medium-latest";
// Reasoning model — non-reasoning Mistral models produced poor tag taxonomies
// in compare-onboarding runs (medium collapsed to one tag, large blew past
// the distinct-tag cap). Magistral follows multi-constraint prompts more
// reliably and prices similarly to mistral-large.
const DEFAULT_RESEARCH_MODEL = "magistral-medium-latest";

async function mistralPost(path: string, body: object): Promise<any> {
	const res = await fetch(`${MISTRAL_BASE_URL}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
	}
	return res.json();
}

function parseConversationsResponse(data: any): { textContent: string; citations: Citation[]; webQueries: string[] } {
	const texts: string[] = [];
	const citations: Citation[] = [];
	const webQueries: string[] = [];
	const seen = new Set<string>();
	let idx = 0;

	for (const entry of data?.outputs ?? []) {
		if (entry?.type === "tool.execution" && entry?.name === "web_search") {
			const raw = entry.arguments;
			const parsed = typeof raw === "string" ? safeJsonParse(raw) : raw;
			if (parsed?.query) webQueries.push(parsed.query);
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

function safeJsonParse(s: string): any {
	try { return JSON.parse(s); } catch { return null; }
}

// Pull a JSON object out of a model's free-form text reply, in case the
// model wraps it in markdown fences despite the prompt saying not to.
function extractJson(text: string): string {
	const trimmed = text.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
	const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (fence) return fence[1].trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export const mistralApi: Provider = {
	id: "mistral-api",
	name: "Mistral API",

	isConfigured() {
		return !!process.env.MISTRAL_API_KEY;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_MODEL;

		if (options?.webSearch) {
			const data = await mistralPost("/v1/conversations", {
				model: version,
				inputs: prompt,
				tools: [{ type: "web_search" }],
			});
			const parsed = parseConversationsResponse(data);
			return { ...parsed, rawOutput: data, modelVersion: data?.model ?? version };
		}

		const data = await mistralPost("/v1/chat/completions", {
			model: version,
			messages: [{ role: "user", content: prompt }],
		});
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
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		// /v1/conversations gives us web_search but rejects response_format,
		// so we prompt-engineer JSON output. Per-field .describe() text from
		// the schema rides along.
		const jsonSchema = z.toJSONSchema(schema as z.ZodType);
		const augmentedPrompt = `${prompt}

OUTPUT FORMAT: Reply with a single JSON object matching this JSON Schema. Output ONLY the JSON object — no prose, no explanation, no markdown code fences:

${JSON.stringify(jsonSchema, null, 2)}`;

		const data = await mistralPost("/v1/conversations", {
			model: DEFAULT_RESEARCH_MODEL,
			inputs: augmentedPrompt,
			tools: [{ type: "web_search" }],
		});
		const { textContent } = parseConversationsResponse(data);
		const jsonText = extractJson(textContent);

		let parsedObject: unknown;
		try {
			parsedObject = JSON.parse(jsonText);
		} catch (err) {
			const sample = jsonText.length > 400 ? `${jsonText.slice(0, 400)}…` : jsonText;
			throw new Error(
				`Mistral returned non-JSON output (model=${DEFAULT_RESEARCH_MODEL}). Sample: ${JSON.stringify(sample)}. Parse error: ${err instanceof Error ? err.message : err}`,
			);
		}
		return {
			object: (schema as z.ZodType).parse(parsedObject) as T,
			modelVersion: data?.model ?? DEFAULT_RESEARCH_MODEL,
		};
	},
};
