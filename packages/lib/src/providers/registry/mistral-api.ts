import { z } from "zod";
import type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	StructuredResearchOptions,
	StructuredResearchResult,
	StructuredResearchToolCall,
} from "../types";
import type { Citation } from "../../text-extraction";

const MISTRAL_BASE_URL = "https://api.mistral.ai";
const DEFAULT_MODEL = "mistral-medium-latest";
// Research uses Mistral's reasoning line (Magistral). Both mistral-medium
// and mistral-large produced poor tag vocabularies in compare-onboarding
// runs — medium fell back to one tag everywhere, large blew past the
// 5-distinct cap. Reasoning models tend to follow multi-constraint prompts
// more reliably; magistral-medium is similar pricing to mistral-large.
const DEFAULT_RESEARCH_MODEL = "magistral-medium-latest";

function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

function authHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
		"Content-Type": "application/json",
	};
}

async function runChatCompletions(prompt: string, model: string): Promise<ScrapeResult> {
	const res = await fetch(`${MISTRAL_BASE_URL}/v1/chat/completions`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
		}),
	});

	if (!res.ok) {
		throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
	}

	const data: any = await res.json();
	const textContent = data?.choices?.[0]?.message?.content ?? "No text content found in Mistral response.";

	return {
		rawOutput: data,
		textContent,
		webQueries: [],
		citations: [],
		modelVersion: data?.model ?? model,
	};
}

async function runConversationsWithWebSearch(prompt: string, model: string): Promise<ScrapeResult> {
	const res = await fetch(`${MISTRAL_BASE_URL}/v1/conversations`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			model,
			inputs: prompt,
			tools: [{ type: "web_search" }],
		}),
	});

	if (!res.ok) {
		throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
	}

	const data: any = await res.json();
	const { textContent, citations, webQueries } = parseConversationsResponse(data);

	return {
		rawOutput: data,
		textContent,
		webQueries,
		citations,
		modelVersion: data?.model ?? model,
	};
}

function parseConversationsResponse(data: any): { textContent: string; citations: Citation[]; webQueries: string[] } {
	const texts: string[] = [];
	const citations: Citation[] = [];
	const webQueries: string[] = [];
	const seen = new Set<string>();
	let idx = 0;

	const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
	for (const entry of outputs) {
		// Tool execution entries surface the search query. `arguments` is a JSON-encoded
		// string in the live response, but we also handle the parsed-object form defensively.
		if ((entry?.type === "tool.execution" || entry?.type === "tool_execution") &&
			(entry?.name === "web_search" || entry?.function === "web_search")) {
			const query = extractMistralQuery(entry);
			if (query) webQueries.push(query);
		}

		// Message output entries hold the model's text. Two shapes seen in the
		// wild from the same Conversations API:
		//   • content as plain string (what /v1/conversations + web_search
		//     returns — the assistant's reply is a single markdown blob)
		//   • content as array of typed chunks (text, tool_reference, …)
		// Handle both.
		if (typeof entry?.content === "string") {
			texts.push(entry.content);
		} else if (Array.isArray(entry?.content)) {
			for (const chunk of entry.content) {
				if (chunk?.type === "text" && typeof chunk.text === "string") {
					texts.push(chunk.text);
				} else if (chunk?.type === "tool_reference" && typeof chunk.url === "string") {
					if (seen.has(chunk.url)) continue;
					seen.add(chunk.url);
					try {
						const parsed = new URL(chunk.url);
						citations.push({
							url: chunk.url,
							title: chunk.title ?? undefined,
							domain: parsed.hostname.replace(/^www\./, ""),
							citationIndex: idx++,
						});
					} catch (e) {
						console.warn(`Mistral: skipping invalid citation URL: ${chunk.url}`, e);
					}
				}
			}
		}
	}

	const textContent = texts.length > 0 ? texts.join("\n") : "No text content found in Mistral response.";
	return { textContent, citations, webQueries };
}

/**
 * Pull a JSON object out of a model's free-form text reply. Handles the
 * common cases where the model wraps the JSON in markdown fences or trails
 * prose around it. Returns the original text untouched if no recognizable
 * JSON structure is found — JSON.parse will throw and the caller surfaces a
 * useful diagnostic.
 */
function extractJsonFromText(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return trimmed;
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
	const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (fence) return fence[1].trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return trimmed;
}

function extractMistralQuery(entry: any): string | null {
	const args = entry?.arguments;
	let parsed: any = args;
	if (typeof args === "string") {
		try { parsed = JSON.parse(args); } catch { parsed = null; }
	}
	const query = parsed?.query ?? entry?.input?.query;
	return typeof query === "string" && query.trim() ? query : null;
}

export const mistralApi: Provider = {
	id: "mistral-api",
	name: "Mistral API",
	defaultResearchModel: DEFAULT_RESEARCH_MODEL,

	isConfigured() {
		return !!process.env.MISTRAL_API_KEY;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_MODEL;
		const result = options?.webSearch
			? await runConversationsWithWebSearch(prompt, version)
			: await runChatCompletions(prompt, version);
		return { ...result, rawOutput: sanitizeForJson(result.rawOutput) };
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		model,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		// Single-call pattern: Mistral's /v1/conversations accepts tools
		// (web_search) but rejects response_format. We prompt-engineer JSON
		// output instead — append the JSON Schema and instruct the model to
		// emit only the matching object. The schema's per-field .describe()
		// text rides along, so tag/alias guidance still gets through.
		const slug = model ?? DEFAULT_RESEARCH_MODEL;
		const jsonSchema = z.toJSONSchema(schema as z.ZodType);
		const augmentedPrompt = `${prompt}

OUTPUT FORMAT: Reply with a single JSON object matching this JSON Schema. Output ONLY the JSON object — no prose, no explanation, no markdown code fences:

${JSON.stringify(jsonSchema, null, 2)}`;

		const res = await fetch(`${MISTRAL_BASE_URL}/v1/conversations`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				model: slug,
				inputs: augmentedPrompt,
				tools: [{ type: "web_search" }],
			}),
		});
		if (!res.ok) {
			throw new Error(`Mistral API error (${res.status}): ${await res.text()}`);
		}
		const data: any = await res.json();
		const { textContent, webQueries } = parseConversationsResponse(data);

		// `parseConversationsResponse` falls back to a sentinel string when it
		// can't find a text chunk where it expects one. If we hit that, the
		// response shape differs from what we walk — dump a bounded sample so
		// it's clear what to fix in the parser.
		if (textContent === "No text content found in Mistral response.") {
			const shape = JSON.stringify(data, null, 2);
			const sample = shape.length > 1500 ? `${shape.slice(0, 1500)}…[+${shape.length - 1500} chars]` : shape;
			throw new Error(
				`Mistral conversations response had no text content where parseConversationsResponse expected it (data.outputs[*].content[*].type==="text"). Raw response:\n${sample}`,
			);
		}

		const jsonText = extractJsonFromText(textContent);
		let parsedObject: unknown;
		try {
			parsedObject = JSON.parse(jsonText);
		} catch (err) {
			const sample = jsonText.length > 400 ? `${jsonText.slice(0, 400)}…` : jsonText;
			throw new Error(`Mistral returned non-JSON output (model=${slug}). Sample: ${JSON.stringify(sample)}. Parse error: ${err instanceof Error ? err.message : err}`);
		}
		const parsed = (schema as z.ZodType).parse(parsedObject);
		const usage = data?.usage
			? {
					inputTokens: data.usage.prompt_tokens ?? 0,
					outputTokens: data.usage.completion_tokens ?? 0,
					totalTokens:
						data.usage.total_tokens ?? (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
				}
			: undefined;
		const toolCalls: StructuredResearchToolCall[] = webQueries.map((query) => ({
			name: "web_search",
			input: { query },
		}));
		return {
			object: parsed as T,
			usage,
			modelVersion: data?.model ?? slug,
			...(toolCalls.length > 0 ? { toolCalls } : {}),
		};
	},
};
