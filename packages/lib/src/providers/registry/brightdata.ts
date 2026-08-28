import { bdclient } from "@brightdata/sdk";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { getCredential } from "../../secrets";
import { type Citation, extractCitationsFromBrightdata, extractTextFromBrightdata } from "../../text-extraction";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";

// Google AI Overview isn't a Web Scraper dataset — it's the AI summary block on
// a normal Google results page, fetched through BrightData's SERP API instead of
// the datasets/v3 collectors below.
const AI_OVERVIEW_MODEL = "google-ai-overview";

const BD_DATASET_IDS: Record<string, string> = {
	chatgpt: "gd_m7aof0k82r803d5bjm",
	perplexity: "gd_m7dhdot1vw9a7gc1n",
	copilot: "gd_m7di5jy6s9geokz8w",
	gemini: "gd_mbz66arm2mf9cu856y",
	"google-ai-mode": "gd_mcswdt6z2elth3zqr2",
};

const BD_BASE_URL: Record<string, string> = {
	chatgpt: "https://chatgpt.com/",
	"google-ai-mode": "https://google.com/aimode",
	gemini: "https://gemini.google.com/",
	copilot: "https://copilot.microsoft.com/chats",
	perplexity: "https://www.perplexity.ai/",
};

function createClient(): bdclient {
	return new bdclient({ apiKey: getCredential("BRIGHTDATA_API_TOKEN") });
}

const BRIGHTDATA_REQUEST_URL = "https://api.brightdata.com/request";

/**
 * Fetch Google's AI Overview through BrightData's SERP API. AI Overview is the
 * AI summary block on a normal results page, so we request a US-English Google
 * SERP as parsed JSON (`brd_json=1`) with `brd_ai_overview=2` — the flag that
 * makes BrightData surface the overview; without it AIO shows up in only a
 * fraction of SERPs. This runs through a serp zone (default `sdk_serp`, the zone
 * the BrightData SDK auto-provisions; override with BRIGHTDATA_SERP_ZONE), billed
 * to the same BRIGHTDATA_API_TOKEN — no dataset id or extra credential. The
 * parsed SERP carries an `ai_overview` object when Google shows one.
 */
async function runGoogleAiOverview(prompt: string): Promise<ScrapeResult> {
	const zone = process.env.BRIGHTDATA_SERP_ZONE ?? "sdk_serp";
	const url = `https://www.google.com/search?q=${encodeURIComponent(prompt)}&brd_json=1&brd_ai_overview=2&gl=us&hl=en`;

	let lastError = "";
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(BRIGHTDATA_REQUEST_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${getCredential("BRIGHTDATA_API_TOKEN")}`,
				"Content-Type": "application/json",
			},
			// `method: "GET"` tells BrightData how to fetch the target URL — without
			// it the response comes back empty. `format: "raw"` returns the brd_json
			// SERP directly as the body.
			body: JSON.stringify({ zone, url, method: "GET", format: "raw" }),
		});
		const text = await res.text();

		let parsed: unknown;
		if (res.ok && text.trim()) {
			try {
				parsed = JSON.parse(text);
			} catch {
				// fall through to retry — a non-JSON body is a transient edge/error page
			}
		}

		if (parsed !== undefined) {
			const citations = extractCitationsFromBrightdata(parsed);
			return {
				rawOutput: parsed,
				textContent: extractTextFromBrightdata(parsed),
				// The SERP API doesn't expose the query expansion behind the overview;
				// mark it unavailable when sources prove a live result, else empty.
				webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
				citations,
				modelVersion: "brightdata-serp",
			};
		}

		lastError = `${res.status} ${text.slice(0, 200)}`.trim();
		await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
	}
	throw new Error(`BrightData SERP request failed after 3 attempts — ${lastError}`);
}

function normalizeAnswer(record: Record<string, any>): string {
	for (const key of ["answer_text_markdown", "answer_text", "answer", "response_raw", "response", "text", "content"]) {
		if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
	}
	return JSON.stringify(record).slice(0, 2000);
}

/**
 * Exported for tests.
 *
 * Do not gate this on `web_search_triggered`. It looks like the right signal
 * and isn't: across real ChatGPT runs, most carry `false` while still
 * reporting a query plainly derived from the prompt ("test 1" → "test 1
 * meaning"), so trusting it discards the bulk of genuine fan-out data.
 *
 * BrightData does occasionally attach another session's search metadata to a
 * correct answer — a run for "test 1" came back with
 * `web_search_query: ["OpenAI GPT-5.6 Luna"]` and matching sources. Nothing in
 * the payload separates that from a real query, and "unrelated to the prompt"
 * would throw away exactly the fan-out this feature exists to surface, so it
 * is recorded as reported and left to the read layer.
 */
export function extractWebQueries(record: Record<string, any>): string[] {
	// web_search_query is a direct array of strings
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
	access: "scraped",
	docsAnchor: "brightdata",

	isConfigured() {
		return !!getCredential("BRIGHTDATA_API_TOKEN");
	},

	validateTarget(config: ModelConfig) {
		// Google AI Overview goes through the SERP API, not a dataset collector.
		if (config.model === AI_OVERVIEW_MODEL) {
			if (!config.webSearch) {
				return `${config.model}:brightdata requires :online — AI Overview always uses web search`;
			}
			return null;
		}
		// Allow custom dataset IDs via version slug (e.g. chatgpt:brightdata:gd_abc123)
		if (!config.version && !BD_DATASET_IDS[config.model]) {
			return `BrightData does not support model "${config.model}". Supported: ${[...Object.keys(BD_DATASET_IDS), AI_OVERVIEW_MODEL].join(", ")}`;
		}
		// ChatGPT has a web search toggle; all other chatbots always search
		if (!config.webSearch && config.model !== "chatgpt") {
			return `${config.model}:brightdata requires :online — this chatbot always uses web search`;
		}
		return null;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		if (model === AI_OVERVIEW_MODEL) {
			return runGoogleAiOverview(prompt);
		}

		const datasetId = options?.version ?? BD_DATASET_IDS[model];
		if (!datasetId) {
			throw new Error(
				`BrightData: no dataset ID for model "${model}". ` +
					`Either use a known model (${Object.keys(BD_DATASET_IDS).join(", ")}) ` +
					`or pass a dataset ID as the version slug: ${model}:brightdata:gd_abc123`,
			);
		}

		const client = createClient();
		let snapshotId: string | undefined;
		let consumed = false;
		try {
			snapshotId = await triggerSnapshot(datasetId, model, prompt, options?.webSearch ?? false);
			await pollUntilReady(snapshotId);
			const payload = await client.scrape.snapshot.fetch(snapshotId, { format: "json" });
			consumed = true;

			const record = (Array.isArray(payload) ? payload[0] : payload) ?? {};
			const answer = normalizeAnswer(record);

			const webQueries = extractWebQueries(record);
			const citations = extractCitationsFromBrightdata(record);

			// Drop large HTML fields that aren't used for extraction.
			// Keeps all structured data (shopping, recommendations, citations, etc.)
			const { answer_html, response_raw, answer_section_html, ...trimmed } = record;
			const rawOutput = Array.isArray(payload) ? [trimmed] : trimmed;

			return {
				rawOutput,
				textContent: answer,
				webQueries: reportedWebQueries(options?.webSearch ?? false, webQueries, citations),
				citations,
				modelVersion: record?.model ?? undefined,
			};
		} finally {
			// A triggered snapshot we never consumed (timeout, terminal failure, an
			// unknown status we gave up on, or any thrown error) keeps running on
			// BrightData and counts against the per-dataset concurrency cap — which
			// eventually 429s even healthy triggers. Best-effort cancel so abandoned
			// jobs don't accumulate. (Worker SIGTERM mid-poll still leaks; those need
			// the periodic snapshot sweep.)
			if (snapshotId && !consumed) await cancelSnapshot(client, snapshotId);
			await client.close();
		}
	},
};

/**
 * Queries are only reported as "unavailable" when web search was on and the
 * answer cited sources but exposed no query strings. With web search off there
 * are never any queries to report.
 */
function reportedWebQueries(webSearch: boolean, webQueries: string[], citations: Citation[]): string[] {
	if (!webSearch) return [];
	if (webQueries.length > 0) return webQueries;
	return citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [];
}

async function triggerSnapshot(datasetId: string, model: string, prompt: string, webSearch: boolean): Promise<string> {
	const response = await fetch(
		`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&notify=false&include_errors=true&format=json`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${getCredential("BRIGHTDATA_API_TOKEN")}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify([
				{
					url: BD_BASE_URL[model] ?? "",
					prompt,
					index: 1,
					// ChatGPT is the only chatbot with a web search toggle.
					...(model === "chatgpt" ? { web_search: webSearch } : {}),
				},
			]),
		},
	);

	if (!response.ok) {
		throw new Error(`BrightData trigger failed (${response.status}): ${await response.text()}`);
	}
	const { snapshot_id } = (await response.json()) as { snapshot_id: string };
	return snapshot_id;
}

/** Terminal failure statuses from datasets/v3/progress. Anything else —
 *  running, building, "starting", queued, or a status BrightData adds later —
 *  is treated as "still working" so a degraded scraper or an unrecognized
 *  status string doesn't fail the run on the very first poll. */
const TERMINAL_FAILURE = new Set(["failed", "error", "cancelled"]);

async function pollUntilReady(snapshotId: string): Promise<void> {
	const maxAttempts = 60;
	const BASE_DELAY = 2000;
	const MAX_DELAY = 10000;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const status = await getSnapshotStatus(snapshotId);
		if (status === "ready") return;
		if (TERMINAL_FAILURE.has(status)) {
			throw new Error(`BrightData snapshot ${snapshotId} ${status}`);
		}

		const delay = Math.min(BASE_DELAY * 2 ** Math.floor(attempt / 5), MAX_DELAY);
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	throw new Error(`BrightData snapshot ${snapshotId} timed out`);
}

/** Read snapshot status straight from datasets/v3/progress. We bypass the SDK's
 *  getStatus because its response schema is a strict enum
 *  (running|ready|failed|cancelled|error) that throws on any other value — and the
 *  live API also returns statuses like "starting", which would otherwise fail the
 *  run instantly instead of waiting. A transient HTTP/parse error is reported as a
 *  non-terminal status so we keep polling rather than abandon the snapshot. */
async function getSnapshotStatus(snapshotId: string): Promise<string> {
	try {
		const res = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
			headers: { Authorization: `Bearer ${getCredential("BRIGHTDATA_API_TOKEN")}` },
		});
		if (!res.ok) return "pending";
		const body = (await res.json()) as { status?: string };
		return body.status ?? "pending";
	} catch {
		return "pending";
	}
}

/** Best-effort cancel of a triggered snapshot we're abandoning, so it stops
 *  counting against BrightData's per-dataset running-jobs cap. Cancellation is
 *  cleanup, not part of the run's success path, so errors are swallowed. */
async function cancelSnapshot(client: bdclient, snapshotId: string): Promise<void> {
	try {
		await client.scrape.snapshot.cancel(snapshotId);
	} catch (e) {
		console.warn(`BrightData: failed to cancel snapshot ${snapshotId}`, e);
	}
}
