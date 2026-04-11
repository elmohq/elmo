import type { Provider, ScrapeResult, ProviderOptions } from "../types";
import type { Citation } from "../../text-extraction";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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
	const seen = new Set<string>();
	const annotations = data?.choices?.[0]?.message?.annotations ?? [];
	for (const ann of annotations) {
		if (ann?.type !== "url_citation") continue;
		// OpenRouter nests citation data under url_citation, but also support flat layout
		const cite = ann.url_citation ?? ann;
		const url = cite.url;
		if (!url || typeof url !== "string" || !url.startsWith("http")) continue;
		if (seen.has(url)) continue;
		seen.add(url);
		try {
			const parsed = new URL(url);
			citations.push({
				url,
				title: cite.title ?? undefined,
				domain: parsed.hostname.replace(/^www\./, ""),
				citationIndex: idx++,
			});
		} catch (e) {
			console.warn(`OpenRouter: skipping invalid citation URL: ${url}`, e);
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

		// Use raw fetch instead of SDK — the OpenRouter SDK strips annotations
		// from the response, which contain web search citations.
		const res = await fetch(OPENROUTER_API_URL, {
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

		if (!res.ok) {
			throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
		}

		const data: any = await res.json();

		const citations = extractCitationsFromOpenRouterResponse(data);
		// OpenRouter doesn't expose what search queries the model made internally.
		// Only mark as "unavailable" when citations prove a web search happened.
		const webQueries = citations.length > 0 ? ["unavailable"] : [];

		return {
			rawOutput: data,
			textContent: extractTextFromOpenRouterResponse(data),
			webQueries,
			citations,
			modelVersion: data?.model ?? modelSlug.replace(":online", ""),
		};
	},
};
