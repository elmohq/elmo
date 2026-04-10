import { OpenRouter } from "@openrouter/sdk";
import type { Provider, ScrapeResult, ProviderOptions } from "../types";
import type { Citation } from "../../text-extraction";

let _client: OpenRouter | null = null;
function getClient(): OpenRouter {
	if (!_client) {
		_client = new OpenRouter({
			apiKey: process.env.OPENROUTER_API_KEY,
			httpReferer: process.env.APP_URL ?? "https://github.com/elmohq/elmo",
			appTitle: "Elmo AEO",
		});
	}
	return _client;
}

function extractTextFromOpenRouterResponse(data: any): string {
	if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
	if (data?.output) {
		const msgs = Array.isArray(data.output) ? data.output.filter((i: any) => i.type === "message") : [];
		const texts: string[] = [];
		for (const msg of msgs) {
			for (const c of msg.content ?? []) {
				if (c.type === "output_text" && c.text) texts.push(c.text);
			}
		}
		if (texts.length) return texts.join("\n");
	}
	return "No text content found in OpenRouter response.";
}

function extractCitationsFromOpenRouterResponse(data: any): Citation[] {
	const citations: Citation[] = [];
	let idx = 0;
	const annotations = data?.choices?.[0]?.message?.annotations ?? [];
	for (const ann of annotations) {
		if (ann?.type === "url_citation" && ann.url) {
			try {
				const parsed = new URL(ann.url);
				citations.push({
					url: ann.url,
					title: ann.title ?? undefined,
					domain: parsed.hostname.replace(/^www\./, ""),
					citationIndex: idx++,
				});
			} catch {
				// skip
			}
		}
	}
	return citations;
}

export const openrouter: Provider = {
	id: "openrouter",
	name: "OpenRouter",

	isConfigured() {
		return !!process.env.OPENROUTER_API_KEY;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		let modelSlug = options?.version;
		if (!modelSlug) {
			throw new Error(
				`OpenRouter requires a version slug in SCRAPE_TARGETS. ` +
				`Example: ${model}:openrouter:openai/gpt-5-mini:online`,
			);
		}

		if (options?.webSearch && !modelSlug.includes(":online")) {
			modelSlug = `${modelSlug}:online`;
		}

		const client = getClient();
		const result = await client.chat.send({
			chatRequest: {
				model: modelSlug,
				messages: [{ role: "user" as const, content: prompt }],
			},
		});

		const data: any = result;

		return {
			rawOutput: data,
			textContent: extractTextFromOpenRouterResponse(data),
			webQueries: [],
			citations: extractCitationsFromOpenRouterResponse(data),
			modelVersion: data?.model ?? modelSlug.replace(":online", ""),
		};
	},
};
