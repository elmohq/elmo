import type { Provider, ScrapeResult, ProviderOptions } from "./types";
import type { Citation } from "../text-extraction";

const OLOSTEP_PARSERS: Record<string, { parserId: string; urlTemplate: (q: string) => string; credits: number }> = {
	chatgpt: {
		parserId: "@olostep/chatgpt-results",
		urlTemplate: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
		credits: 5,
	},
	"google-ai-mode": {
		parserId: "@olostep/google-aimode-results",
		urlTemplate: (q) => `https://google.com/aimode?q=${encodeURIComponent(q)}`,
		credits: 3,
	},
	"google-ai-overview": {
		parserId: "@olostep/google-ai-overview-results",
		urlTemplate: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
		credits: 3,
	},
	gemini: {
		parserId: "@olostep/gemini-results",
		urlTemplate: (q) => `https://gemini.google.com/?q=${encodeURIComponent(q)}`,
		credits: 3,
	},
	copilot: {
		parserId: "@olostep/microsoft-copilot-results",
		urlTemplate: (q) => `https://copilot.microsoft.com/chats?q=${encodeURIComponent(q)}`,
		credits: 3,
	},
	perplexity: {
		parserId: "@olostep/perplexity-results",
		urlTemplate: (q) => `https://www.perplexity.ai/?q=${encodeURIComponent(q)}`,
		credits: 3,
	},
	grok: {
		parserId: "@olostep/grok-results",
		urlTemplate: (q) => `https://grok.com/?q=${encodeURIComponent(q)}`,
		credits: 3,
	},
};

function extractTextFromOlostep(data: any): string {
	if (data?.result?.markdown_content) return data.result.markdown_content;
	if (data?.answer_markdown) return data.answer_markdown;
	if (data?.result?.text_content) return data.result.text_content;
	if (typeof data?.answer === "string") return data.answer;
	return "No text content found in Olostep response.";
}

function extractCitationsFromOlostep(data: any): Citation[] {
	const citations: Citation[] = [];
	const sources = data?.sources ?? data?.result?.links_on_page ?? data?.inline_references ?? [];
	let idx = 0;
	for (const source of Array.isArray(sources) ? sources : []) {
		const url = typeof source === "string" ? source : source?.url;
		if (!url || typeof url !== "string") continue;
		try {
			const parsed = new URL(url);
			citations.push({
				url,
				title: source?.title ?? source?.label ?? undefined,
				domain: parsed.hostname.replace(/^www\./, ""),
				citationIndex: idx++,
			});
		} catch {
			// skip invalid URLs
		}
	}
	return citations;
}

function extractWebQueries(data: any): string[] {
	const queries: string[] = [];
	const searchCalls = data?.network_search_calls?.search_queries ?? data?.search_model_queries ?? [];
	for (const call of Array.isArray(searchCalls) ? searchCalls : []) {
		if (call?.query) queries.push(call.query);
	}
	return queries;
}

export const olostep: Provider = {
	id: "olostep",
	name: "Olostep",

	isConfigured() {
		return !!process.env.OLOSTEP_API_KEY;
	},

	async run(engine: string, prompt: string, _options?: ProviderOptions): Promise<ScrapeResult> {
		const parserConfig = OLOSTEP_PARSERS[engine];
		if (!parserConfig) throw new Error(`Olostep does not support engine "${engine}"`);

		const response = await fetch("https://api.olostep.com/v1/scrapes", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OLOSTEP_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url_to_scrape: parserConfig.urlTemplate(prompt),
				formats: ["json"],
				parser: { id: parserConfig.parserId },
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Olostep API error (${response.status}): ${text}`);
		}

		const data: any = await response.json();
		const parsed = data?.result?.json_content ? JSON.parse(data.result.json_content) : data;

		return {
			rawOutput: data,
			textContent: extractTextFromOlostep(parsed),
			webQueries: extractWebQueries(parsed),
			citations: extractCitationsFromOlostep(parsed),
			modelVersion: parsed?.model ?? undefined,
		};
	},
};
