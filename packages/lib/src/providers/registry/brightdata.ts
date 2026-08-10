import { bdclient } from "@brightdata/sdk";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { getCredential } from "../../secrets";
import { type Citation, extractCitationsFromBrightdata, extractTextFromBrightdata } from "../../text-extraction";
import {
	isProviderFatalError,
	ProviderFatalError,
	providerHttpResponseError,
	ProviderResponseError,
	ProviderRunRejectedError,
	ProviderTaskFailedError,
	ProviderTaskPendingError,
	providerErrorStatus,
} from "../errors";
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
const BRIGHTDATA_HTTP_TIMEOUT_MS = 2 * 60 * 1000;
const BRIGHTDATA_RESUME_DELAY_MS = 30_000;

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
async function runGoogleAiOverview(prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const zone = process.env.BRIGHTDATA_SERP_ZONE ?? "sdk_serp";
	const url = `https://www.google.com/search?q=${encodeURIComponent(prompt)}&brd_json=1&brd_ai_overview=2&gl=us&hl=en`;

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
		signal: AbortSignal.timeout(BRIGHTDATA_HTTP_TIMEOUT_MS),
	});
	const text = await res.text();
	if (!res.ok) {
		const message = `BrightData SERP request failed (${res.status}): ${text.slice(0, 200)}`;
		throw providerHttpResponseError(message, res.status);
	}

	const rawOutput = text;
	await options?.checkpointRawResponse?.({ rawOutput, modelVersion: "brightdata-serp" });

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error("BrightData SERP returned an invalid JSON response", { cause: error });
	}

	const citations = extractCitationsFromBrightdata(parsed);
	return {
		rawOutput,
		textContent: extractTextFromBrightdata(parsed),
		// The SERP API doesn't expose the query expansion behind the overview;
		// mark it unavailable when sources prove a live result, else empty.
		webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
		citations,
		modelVersion: "brightdata-serp",
	};
}

function normalizeAnswer(record: Record<string, any>): string {
	for (const key of ["answer_text_markdown", "answer_text", "answer", "response_raw", "response", "text", "content"]) {
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
			return runGoogleAiOverview(prompt, options);
		}

		const datasetId = options?.version ?? BD_DATASET_IDS[model];
		if (!datasetId) {
			throw new ProviderRunRejectedError(
				`BrightData: no dataset ID for model "${model}". ` +
					`Either use a known model (${Object.keys(BD_DATASET_IDS).join(", ")}) ` +
					`or pass a dataset ID as the version slug: ${model}:brightdata:gd_abc123`,
			);
		}

		const client = createClient();
		let snapshotId = options?.externalTaskId;
		let consumed = false;
		let resumable = !!snapshotId;
		try {
			if (!snapshotId) {
				const triggerRes = await fetch(
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
								...(model === "chatgpt" ? { web_search: options?.webSearch ?? false } : {}),
							},
						]),
						signal: AbortSignal.timeout(BRIGHTDATA_HTTP_TIMEOUT_MS),
					},
				);

				if (!triggerRes.ok) {
					const message = `BrightData trigger failed (${triggerRes.status}): ${await triggerRes.text()}`;
					throw providerHttpResponseError(message, triggerRes.status);
				}

				({ snapshot_id: snapshotId } = (await triggerRes.json()) as { snapshot_id: string });
				if (!snapshotId) throw new Error("BrightData trigger returned no snapshot id");
				await options?.checkpointExternalTask?.(snapshotId);
				resumable = true;
			}
			await pollUntilReady(snapshotId);
			let payload: unknown;
			try {
				payload = await client.scrape.snapshot.fetch(snapshotId, { format: "json" });
			} catch (error) {
				const status = providerErrorStatus(error);
				if (isProviderFatalError(error)) {
					throw new ProviderFatalError(`BrightData snapshot ${snapshotId} could not be fetched`, {
						cause: error,
						taskAccepted: true,
					});
				}
				if (status === 404 || status === 410) {
					throw new ProviderTaskFailedError(`BrightData snapshot ${snapshotId} no longer exists`, { cause: error });
				}
				throw new ProviderTaskPendingError(
					`BrightData snapshot ${snapshotId} is ready but its result could not be fetched`,
					BRIGHTDATA_RESUME_DELAY_MS,
					{ cause: error },
				);
			}
			consumed = true;
			const rawOutput = payload ?? {};
			await options?.checkpointRawResponse?.({ rawOutput });

			const record = (Array.isArray(rawOutput) ? rawOutput[0] : rawOutput) ?? {};
			const answer = normalizeAnswer(record);

			const webQueries = extractWebQueries(record);
			const citations = extractSources(record);

			return {
				rawOutput,
				textContent: answer,
				// Only mark web queries as "unavailable" when web search was enabled
				// and citations exist but no query strings were exposed.
				// When web search is disabled, webQueries is always empty.
				webQueries: options?.webSearch
					? webQueries.length > 0
						? webQueries
						: citations.length > 0
							? [WEB_QUERIES_UNAVAILABLE]
							: []
					: [],
				citations,
				modelVersion: record?.model ?? undefined,
			};
		} catch (error) {
			if (error instanceof ProviderTaskPendingError) resumable = true;
			if (error instanceof ProviderTaskFailedError) resumable = false;
			throw error;
		} finally {
			// A triggered snapshot we never consumed (timeout, terminal failure, an
			// unknown status we gave up on, or any thrown error) keeps running on
			// BrightData and counts against the per-dataset concurrency cap — which
			// eventually 429s even healthy triggers. Best-effort cancel so abandoned
			// jobs don't accumulate. (Worker SIGTERM mid-poll still leaks; those need
			// the periodic snapshot sweep.)
			if (snapshotId && !consumed && !resumable) await cancelSnapshot(client, snapshotId);
			await client.close();
		}
	},
};

/** Terminal failure statuses from datasets/v3/progress. Anything else —
 *  running, building, "starting", queued, or a status BrightData adds later —
 *  is treated as "still working" so a degraded scraper or an unrecognized
 *  status string doesn't fail the run on the very first poll. */
const TERMINAL_FAILURE = new Set(["failed", "error", "cancelled"]);

async function pollUntilReady(snapshotId: string): Promise<void> {
	const deadline = Date.now() + 30_000;
	const BASE_DELAY = 2000;
	const MAX_DELAY = 10000;

	for (let attempt = 0; Date.now() < deadline; attempt++) {
		const status = await getSnapshotStatus(snapshotId);
		if (status === "ready") return;
		if (TERMINAL_FAILURE.has(status)) {
			throw new ProviderTaskFailedError(`BrightData snapshot ${snapshotId} ${status}`);
		}

		const delay = Math.min(BASE_DELAY * 2 ** Math.floor(attempt / 5), MAX_DELAY);
		await new Promise((resolve) => setTimeout(resolve, Math.min(delay, deadline - Date.now())));
	}

	throw new ProviderTaskPendingError(`BrightData snapshot ${snapshotId} is still running`, BRIGHTDATA_RESUME_DELAY_MS);
}

/** Read snapshot status straight from datasets/v3/progress. We bypass the SDK's
 *  getStatus because its response schema is a strict enum
 *  (running|ready|failed|cancelled|error) that throws on any other value — and the
 *  live API also returns statuses like "starting", which would otherwise fail the
 *  run instantly instead of waiting. HTTP failures are surfaced so the durable
 *  scheduler can back off or terminate a task deliberately. */
async function getSnapshotStatus(snapshotId: string): Promise<string> {
	const res = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
		headers: { Authorization: `Bearer ${getCredential("BRIGHTDATA_API_TOKEN")}` },
		signal: AbortSignal.timeout(BRIGHTDATA_HTTP_TIMEOUT_MS),
	});
	if (!res.ok) {
		const message = `BrightData snapshot status failed (${res.status}): ${(await res.text()).slice(0, 200)}`;
		if (res.status === 401 || res.status === 402 || res.status === 403) {
			throw new ProviderFatalError(message, { taskAccepted: true });
		}
		if (res.status === 404 || res.status === 410) throw new ProviderTaskFailedError(message);
		throw new ProviderResponseError(message, { taskAccepted: true });
	}
	const body = (await res.json()) as { status?: string };
	return body.status ?? "pending";
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
