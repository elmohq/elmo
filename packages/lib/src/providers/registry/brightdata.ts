import { bdclient } from "@brightdata/sdk";
import type { Provider, ScrapeResult, ProviderOptions, ModelConfig } from "../types";
import type { Citation } from "../../text-extraction";

const BD_DATASET_IDS: Record<string, string> = {
	chatgpt: "gd_m7aof0k82r803d5bjm",
	perplexity: "gd_m7dhdot1vw9a7gc1n",
	gemini: "gd_mbz66arm2mf9cu856y",
	grok: "gd_m8ve0u141icu75ae74",
	"google-ai-mode": "gd_mcswdt6z2elth3zqr2",
};

const BD_BASE_URL: Record<string, string> = {
	chatgpt: "https://chatgpt.com/",
	"google-ai-mode": "https://google.com/aimode",
	"google-ai-overview": "https://www.google.com/",
	gemini: "https://gemini.google.com/",
	perplexity: "https://www.perplexity.ai/",
	grok: "https://grok.com/",
};

function createClient(): bdclient {
	return new bdclient({ apiKey: process.env.BRIGHTDATA_API_TOKEN });
}

function normalizeAnswer(record: Record<string, any>): string {
	for (const key of ["answer_text", "answer_text_markdown", "answer", "response_raw", "response", "text", "content"]) {
		if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
	}
	return JSON.stringify(record).slice(0, 2000);
}

function extractSources(record: Record<string, any>): Citation[] {
	const citations: Citation[] = [];
	const seen = new Set<string>();
	let idx = 0;

	for (const field of ["citations", "links_attached", "sources"]) {
		const arr = record[field];
		if (!Array.isArray(arr)) continue;
		for (const item of arr) {
			const url = typeof item === "string" ? item : item?.url;
			if (!url || typeof url !== "string" || !url.startsWith("http")) continue;
			if (seen.has(url)) continue;
			seen.add(url);
			try {
				const parsed = new URL(url);
				citations.push({
					url,
					title: item?.title ?? undefined,
					domain: parsed.hostname.replace(/^www\./, ""),
					citationIndex: idx++,
				});
			} catch (e) {
				console.warn(`BrightData: skipping invalid citation URL: ${url}`, e);
			}
		}
	}
	return citations;
}

function extractWebQueries(record: Record<string, any>): string[] {
	// web_search_query is a direct array of strings (e.g. grok)
	if (Array.isArray(record.web_search_query)) {
		return record.web_search_query.filter((q: any) => typeof q === "string" && q.trim());
	}
	// search_model_queries may be nested in metadata (e.g. chatgpt)
	const smq = record.metadata?.search_model_queries ?? record.search_model_queries;
	if (smq?.queries && Array.isArray(smq.queries)) {
		return smq.queries.filter((q: any) => typeof q === "string" && q.trim());
	}
	if (Array.isArray(smq)) {
		return smq.filter((q: any) => typeof q === "string" && q.trim());
	}
	return [];
}

export const brightdata: Provider = {
	id: "brightdata",
	name: "BrightData",

	isConfigured() {
		return !!process.env.BRIGHTDATA_API_TOKEN;
	},

	validateTarget(config: ModelConfig) {
		// Allow custom dataset IDs via version slug (e.g. chatgpt:brightdata:gd_abc123)
		if (!config.version && !BD_DATASET_IDS[config.model]) {
			return `BrightData does not support model "${config.model}". Supported: ${Object.keys(BD_DATASET_IDS).join(", ")}`;
		}
		// ChatGPT has a web search toggle; all other chatbots always search
		if (!config.webSearch && config.model !== "chatgpt") {
			return `${config.model}:brightdata requires :online — this chatbot always uses web search`;
		}
		return null;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const datasetId = options?.version ?? BD_DATASET_IDS[model];
		if (!datasetId) {
			throw new Error(
				`BrightData: no dataset ID for model "${model}". ` +
				`Either use a known model (${Object.keys(BD_DATASET_IDS).join(", ")}) ` +
				`or pass a dataset ID as the version slug: ${model}:brightdata:gd_abc123`,
			);
		}

		const client = createClient();
		try {
			const triggerRes = await fetch(
				`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&notify=false&include_errors=true&format=json`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify([{ url: BD_BASE_URL[model] ?? "", prompt, index: 1 }]),
				},
			);

			if (!triggerRes.ok) {
				throw new Error(`BrightData trigger failed (${triggerRes.status}): ${await triggerRes.text()}`);
			}

			const { snapshot_id: snapshotId } = (await triggerRes.json()) as { snapshot_id: string };
			await pollUntilReady(client, snapshotId);
			const payload = await client.scrape.snapshot.fetch(snapshotId, { format: "json" });

			const record = (Array.isArray(payload) ? payload[0] : payload) ?? {};
			const answer = normalizeAnswer(record);

			const webQueries = extractWebQueries(record);
			const citations = extractSources(record);

			// Drop large HTML fields that aren't used for extraction.
			// Keeps all structured data (shopping, recommendations, citations, etc.)
			const { answer_html, response_raw, answer_section_html, ...trimmed } = record;
			const rawOutput = Array.isArray(payload) ? [trimmed] : trimmed;

			return {
				rawOutput,
				textContent: answer,
				// Mark as "unavailable" only when citations prove a search happened
				// but the API didn't expose the query strings
				webQueries: webQueries.length > 0 ? webQueries : citations.length > 0 ? ["unavailable"] : [],
				citations,
				modelVersion: record?.model ?? undefined,
			};
		} finally {
			await client.close();
		}
	},
};

async function pollUntilReady(client: bdclient, snapshotId: string): Promise<void> {
	const maxAttempts = 60;
	const BASE_DELAY = 2000;
	const MAX_DELAY = 10000;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const status = await client.scrape.snapshot.getStatus(snapshotId);
		if (status.status === "ready") return;
		if (status.status === "failed" || status.status === "cancelled") {
			throw new Error(`BrightData snapshot ${snapshotId} ${status.status}`);
		}

		const delay = Math.min(BASE_DELAY * Math.pow(2, Math.floor(attempt / 5)), MAX_DELAY);
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	throw new Error(`BrightData snapshot ${snapshotId} timed out`);
}
