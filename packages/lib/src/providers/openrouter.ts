import type { Provider, ScrapeResult, ProviderOptions, TestResult } from "./types";
import type { Citation } from "../text-extraction";

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

	supportedEngines() {
		return [];
	},

	supportsWebSearchToggle() {
		return true;
	},

	async run(engine: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		let modelSlug = options?.model;
		if (!modelSlug) {
			throw new Error(
				`OpenRouter requires a model slug in SCRAPE_TARGETS. ` +
				`Example: ${engine}:openrouter:openai/gpt-5-mini:online`,
			);
		}

		if (options?.webSearch && !modelSlug.includes(":online")) {
			modelSlug = `${modelSlug}:online`;
		}

		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
				"HTTP-Referer": process.env.APP_URL ?? "https://github.com/elmohq/elmo",
				"X-Title": "Elmo AEO",
			},
			body: JSON.stringify({
				model: modelSlug,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`OpenRouter API error (${response.status}): ${text}`);
		}

		const data: any = await response.json();

		return {
			rawOutput: data,
			textContent: extractTextFromOpenRouterResponse(data),
			webQueries: [],
			citations: extractCitationsFromOpenRouterResponse(data),
			modelVersion: data?.model ?? modelSlug.replace(":online", ""),
		};
	},

	async testConnection(engine: string): Promise<TestResult> {
		return {
			success: false,
			latencyMs: 0,
			error: "OpenRouter requires a model slug — use the admin providers page or test-providers.ts with SCRAPE_TARGETS configured",
		};
	},
};
