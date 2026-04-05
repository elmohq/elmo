import type { Provider, ScrapeResult, ProviderOptions, TestResult } from "./types";
import type { Citation } from "../text-extraction";

const BD_DATASET_ENV: Record<string, string> = {
	chatgpt: "BRIGHTDATA_DATASET_CHATGPT",
	"google-ai-mode": "BRIGHTDATA_DATASET_GOOGLE_AI_MODE",
	"google-ai-overview": "BRIGHTDATA_DATASET_GOOGLE_AI_OVERVIEW",
	gemini: "BRIGHTDATA_DATASET_GEMINI",
	copilot: "BRIGHTDATA_DATASET_COPILOT",
	perplexity: "BRIGHTDATA_DATASET_PERPLEXITY",
	grok: "BRIGHTDATA_DATASET_GROK",
};

const BD_BASE_URL: Record<string, string> = {
	chatgpt: "https://chatgpt.com/",
	"google-ai-mode": "https://www.google.com/",
	"google-ai-overview": "https://www.google.com/",
	gemini: "https://gemini.google.com/",
	copilot: "https://copilot.microsoft.com/",
	perplexity: "https://www.perplexity.ai/",
	grok: "https://grok.com/",
};

function getApiKey(): string {
	const key = process.env.BRIGHTDATA_API_TOKEN;
	if (!key) throw new Error("Missing BRIGHTDATA_API_TOKEN");
	return key;
}

function getDatasetId(engine: string): string | undefined {
	const envKey = BD_DATASET_ENV[engine];
	return envKey ? process.env[envKey] : undefined;
}

function authHeaders() {
	return {
		Authorization: `Bearer ${getApiKey()}`,
		"Content-Type": "application/json",
	};
}

async function pollForCompletion(snapshotId: string): Promise<void> {
	const maxAttempts = 60;
	const BASE_DELAY = 2000;
	const MAX_DELAY = 10000;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const res = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
			method: "GET",
			headers: authHeaders(),
		});

		if (!res.ok) throw new Error(`BrightData progress check failed (${res.status})`);

		const json = (await res.json()) as { status: string };
		if (json.status === "ready") return;
		if (json.status === "failed") throw new Error("BrightData snapshot failed");

		const delay = Math.min(BASE_DELAY * Math.pow(2, Math.floor(attempt / 5)), MAX_DELAY);
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	throw new Error(`BrightData snapshot ${snapshotId} timed out`);
}

function normalizeAnswer(record: Record<string, any>): string {
	for (const key of ["answer_text", "answer_text_markdown", "answer", "response_raw", "response", "text", "content"]) {
		if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
	}
	return JSON.stringify(record).slice(0, 2000);
}

function extractSources(record: Record<string, any>, answer: string): Citation[] {
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
			} catch {
				// skip invalid
			}
		}
	}
	return citations;
}

export const brightdata: Provider = {
	id: "brightdata",
	name: "BrightData",

	isConfigured() {
		return !!process.env.BRIGHTDATA_API_TOKEN;
	},

	supportedEngines() {
		return Object.keys(BD_DATASET_ENV).filter((engine) => getDatasetId(engine));
	},

	supportsWebSearchToggle() {
		return true;
	},

	async run(engine: string, prompt: string, _options?: ProviderOptions): Promise<ScrapeResult> {
		const datasetId = getDatasetId(engine);
		if (!datasetId) throw new Error(`BrightData: missing dataset ID env var for engine "${engine}" (${BD_DATASET_ENV[engine]})`);

		// Always send a single item per request.
		// Batches of 2+ items change BrightData's expected response time from seconds to ~5-30 minutes,
		// even for just 2 items. This is a BrightData API behavior, not a rate limit.
		const scrapeRes = await fetch(
			`https://api.brightdata.com/datasets/v3/scrape?dataset_id=${datasetId}&notify=false&include_errors=true&format=json`,
			{
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ input: [{ url: BD_BASE_URL[engine] ?? "", prompt, index: 1 }] }),
			},
		);

		let payload: any;
		if (scrapeRes.status === 202) {
			const pending = (await scrapeRes.json()) as { snapshot_id: string };
			await pollForCompletion(pending.snapshot_id);
			const downloadRes = await fetch(
				`https://api.brightdata.com/datasets/v3/snapshot/${pending.snapshot_id}?format=json`,
				{ method: "GET", headers: authHeaders() },
			);
			if (!downloadRes.ok) throw new Error(`BrightData download failed (${downloadRes.status})`);
			payload = await downloadRes.json();
		} else if (scrapeRes.ok) {
			payload = await scrapeRes.json();
		} else {
			throw new Error(`BrightData scrape failed (${scrapeRes.status}): ${await scrapeRes.text()}`);
		}

		const record = (Array.isArray(payload) ? payload[0] : payload) ?? {};
		const answer = normalizeAnswer(record);

		return {
			rawOutput: payload,
			textContent: answer,
			webQueries: record?.prompt ? [record.prompt] : [prompt],
			citations: extractSources(record, answer),
			modelVersion: record?.model ?? undefined,
		};
	},

	async testConnection(engine: string): Promise<TestResult> {
		const start = Date.now();
		try {
			const result = await this.run(engine, "What is 2+2?");
			return {
				success: true,
				latencyMs: Date.now() - start,
				sampleOutput: result.textContent.slice(0, 200),
			};
		} catch (error) {
			return {
				success: false,
				latencyMs: Date.now() - start,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
};
