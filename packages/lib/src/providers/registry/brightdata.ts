import { bdclient } from "@brightdata/sdk";
import { getCredential } from "../../secrets";
import { extractCitationsFromBrightdata } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import { pollTask, type TaskState } from "./poll-task";
import { type Attempt, hasWebSearchToggle, nonEmptyStrings, retryTransient } from "./scrape-shared";

const AI_OVERVIEW_MODEL = "google-ai-overview";

const BD_DATASET_IDS: Record<string, string> = {
	chatgpt: "gd_m7aof0k82r803d5bjm",
	gemini: "gd_mbz66arm2mf9cu856y",
	"google-ai-mode": "gd_mcswdt6z2elth3zqr2",
};

const BD_BASE_URL: Record<string, string> = {
	chatgpt: "https://chatgpt.com/",
	"google-ai-mode": "https://google.com/aimode",
	gemini: "https://gemini.google.com/",
};

function createClient(): bdclient {
	return new bdclient({ apiKey: getCredential("BRIGHTDATA_API_TOKEN") });
}

const BRIGHTDATA_REQUEST_URL = "https://api.brightdata.com/request";

/**
 * AI Overview isn't a dataset, so it comes through the SERP API. Without
 * `brd_ai_overview=2` the overview appears in only a fraction of SERPs. The
 * default `sdk_serp` zone is the one the BrightData SDK auto-provisions.
 */
function runGoogleAiOverview(prompt: string): Promise<ScrapeResult> {
	const zone = process.env.BRIGHTDATA_SERP_ZONE ?? "sdk_serp";
	const url = `https://www.google.com/search?q=${encodeURIComponent(prompt)}&brd_json=1&brd_ai_overview=2&gl=us&hl=en`;

	return retryTransient(
		() => attemptGoogleAiOverview(zone, url),
		(lastError) => `BrightData SERP request failed after 3 attempts — ${lastError}`,
	);
}

async function attemptGoogleAiOverview(zone: string, url: string): Promise<Attempt<ScrapeResult>> {
	const res = await fetch(BRIGHTDATA_REQUEST_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getCredential("BRIGHTDATA_API_TOKEN")}`,
			"Content-Type": "application/json",
		},
		// Without `method: "GET"` the response comes back empty.
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
	if (parsed === undefined) return { error: `${res.status} ${text.slice(0, 200)}`.trim() };

	const citations = extractCitationsFromBrightdata(parsed);
	return {
		result: {
			rawOutput: parsed,
			// The SERP API doesn't expose the query expansion behind the overview;
			// mark it unavailable when sources prove a live result, else empty.
			webQueries: reportedWebQueries([], { searchProven: citations.length > 0 }),
			modelVersion: "brightdata-serp",
		},
	};
}

function findAnswer(record: Record<string, any>): string | null {
	for (const key of ["answer_text_markdown", "answer_text", "answer", "response_raw", "response", "text", "content"]) {
		if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
	}
	return null;
}

/** `response_raw` stays when it is the record's only answer, or a replay would find no text. */
export function storedRecord(record: Record<string, any>): Record<string, any> {
	const { answer_html, response_raw, answer_section_html, ...trimmed } = record;
	const answeredElsewhere = findAnswer(trimmed) !== null;
	return answeredElsewhere || response_raw === undefined ? trimmed : { ...trimmed, response_raw };
}

function rowError(record: Record<string, any>): string | null {
	const parts = [record.error, record.error_code]
		.map((value) => (typeof value === "string" ? value.trim() : value ? JSON.stringify(value) : ""))
		.filter(Boolean);
	return parts.length > 0 ? parts.join(" — ") : null;
}

/** Exported for tests. `include_errors=true` means a ready snapshot can carry a
 *  per-input failure in place of an answer. */
export function readAnswer(record: Record<string, any>, subject: string): string {
	const answer = findAnswer(record);
	if (answer) return answer;
	const error = rowError(record);
	throw new Error(
		error
			? `BrightData ${subject} returned an error row: ${error}`
			: `BrightData ${subject} returned a row with no answer`,
	);
}

/**
 * Exported for tests. Don't gate on `web_search_triggered`: most real ChatGPT runs
 * carry `false` alongside a genuine query. BrightData sometimes attaches another
 * session's queries too, but nothing in the payload tells those apart, so they
 * are recorded as reported.
 */
export function extractWebQueries(record: Record<string, any>): string[] {
	if (Array.isArray(record.web_search_query)) return nonEmptyStrings(record.web_search_query);
	// search_model_queries may be nested in metadata (e.g. chatgpt)
	const smq = record.metadata?.search_model_queries ?? record.search_model_queries;
	return nonEmptyStrings(smq?.queries ?? smq);
}

export const brightdata: Provider = {
	id: "brightdata",
	name: "BrightData",
	access: "scraped",
	docsAnchor: "brightdata",

	isConfigured: configuredWhen("BRIGHTDATA_API_TOKEN"),

	validateTarget(config: ModelConfig) {
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
		if (!config.webSearch && !hasWebSearchToggle(config.model)) {
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
			// Refuses a snapshot with no answer, which extraction would store as empty.
			readAnswer(record, `${model} snapshot ${snapshotId}`);

			const webQueries = extractWebQueries(record);
			const citations = extractCitationsFromBrightdata(record);

			const trimmed = storedRecord(record);
			const rawOutput = Array.isArray(payload) ? [trimmed] : trimmed;

			return {
				rawOutput,
				webQueries: reportedWebQueries(webQueries, {
					webSearch: options?.webSearch ?? false,
					searchProven: citations.length > 0,
				}),
				modelVersion: record?.model ?? undefined,
			};
		} finally {
			// An abandoned snapshot keeps running and counts against the per-dataset
			// concurrency cap, which eventually 429s healthy triggers. A SIGTERM
			// mid-poll still leaks one; the periodic snapshot sweep catches those.
			if (snapshotId && !consumed) await cancelSnapshot(client, snapshotId);
			await client.close();
		}
	},
};

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
					...(hasWebSearchToggle(model) ? { web_search: webSearch } : {}),
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

const TERMINAL_FAILURE = new Set(["failed", "error", "cancelled"]);

/** No documented deadline: sized past the slowest error row a stuck input has produced. */
const POLL_TIMEOUT_MS = 12 * 60 * 1000;

function snapshotState(status: string): TaskState {
	if (status === "ready") return "ready";
	if (TERMINAL_FAILURE.has(status)) return "failed";
	// Unrecognised statuses (e.g. "starting") must not fail the run on the first poll.
	return "running";
}

function pollUntilReady(snapshotId: string): Promise<string | undefined> {
	return pollTask<string>({
		describe: `BrightData snapshot ${snapshotId}`,
		poll: () => getSnapshotStatus(snapshotId),
		classify: snapshotState,
		describeFailure: (status) => ` (${status})`,
		totalTimeoutMs: POLL_TIMEOUT_MS,
	});
}

/**
 * Bypasses the SDK's getStatus, whose strict enum throws on live statuses like
 * "starting". A transient error reads as null, so the last known status stands.
 */
async function getSnapshotStatus(snapshotId: string): Promise<string | null> {
	try {
		const res = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
			headers: { Authorization: `Bearer ${getCredential("BRIGHTDATA_API_TOKEN")}` },
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { status?: string };
		return body.status ?? null;
	} catch {
		return null;
	}
}

/** Cleanup, not part of the run, so errors are swallowed. */
async function cancelSnapshot(client: bdclient, snapshotId: string): Promise<void> {
	try {
		await client.scrape.snapshot.cancel(snapshotId);
	} catch (e) {
		console.warn(`BrightData: failed to cancel snapshot ${snapshotId}`, e);
	}
}
