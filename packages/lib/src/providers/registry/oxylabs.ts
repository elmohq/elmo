import type { Provider, ScrapeResult, ProviderOptions, ModelConfig } from "../types";
import { extractTextFromOxylabs, extractCitationsFromOxylabs, type Citation } from "../../text-extraction";

// Oxylabs Web Scraper API sources for AI surfaces.
// ChatGPT and Perplexity use `prompt`; the Google surfaces use `query` and
// require `render: html` — AI Mode via the `google_ai_mode` source, AI Overview
// via a `google_search` SERP whose parsed result carries the overview block.
const OXYLABS_SOURCES: Record<string, { source: string; field: "prompt" | "query"; render?: string }> = {
	chatgpt: { source: "chatgpt", field: "prompt" },
	perplexity: { source: "perplexity", field: "prompt" },
	"google-ai-mode": { source: "google_ai_mode", field: "query", render: "html" },
	"google-ai-overview": { source: "google_search", field: "query", render: "html" },
};

// AI answers can outlive the Realtime API's connection TTL. Use single-job
// Push-Pull for every source; ChatGPT and Perplexity do not support batch jobs.
const OXYLABS_JOBS_URL = "https://data.oxylabs.io/v1/queries";
const OXYLABS_JOB_TIMEOUT_MS = 10 * 60 * 1000;
const OXYLABS_POLL_BASE_DELAY_MS = 2000;
const OXYLABS_POLL_MAX_DELAY_MS = 10_000;

interface OxylabsJob {
	id?: string;
	status?: string;
	statuses?: unknown;
}

interface OxylabsPayload {
	results?: Array<{ content?: Record<string, any> }>;
}

function basicAuthHeader(): string {
	const token = btoa(`${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}`);
	return `Basic ${token}`;
}

function requestHeaders(): Record<string, string> {
	return {
		Authorization: basicAuthHeader(),
		"Content-Type": "application/json",
	};
}

function pollDelay(attempt: number): number {
	return Math.min(OXYLABS_POLL_BASE_DELAY_MS * Math.pow(2, Math.floor(attempt / 5)), OXYLABS_POLL_MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

async function responseError(res: Response): Promise<string> {
	return `${res.status}: ${(await res.text()).slice(0, 500)}`.trim();
}

function faultDetails(job: OxylabsJob): string {
	if (job.statuses === undefined || job.statuses === null) return "";
	const serialized = typeof job.statuses === "string" ? job.statuses : JSON.stringify(job.statuses);
	return serialized ? ` (${serialized.slice(0, 500)})` : "";
}

async function submitJob(body: Record<string, any>): Promise<OxylabsJob> {
	const res = await fetch(OXYLABS_JOBS_URL, {
		method: "POST",
		headers: requestHeaders(),
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		throw new Error(`Oxylabs job submission failed (${await responseError(res)})`);
	}

	const job = (await res.json()) as OxylabsJob;
	if (!job.id) throw new Error("Oxylabs job submission returned no job id");
	return job;
}

async function getJob(jobId: string): Promise<OxylabsJob | null> {
	try {
		const res = await fetch(`${OXYLABS_JOBS_URL}/${jobId}`, {
			headers: requestHeaders(),
		});
		if (res.status === 204 || isTransientStatus(res.status)) return null;
		if (!res.ok) {
			throw new Error(`Oxylabs job status request failed (${await responseError(res)})`);
		}
		return (await res.json()) as OxylabsJob;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Oxylabs job status request failed")) throw error;
		return null;
	}
}

async function waitForJob(initialJob: OxylabsJob, deadline: number): Promise<void> {
	let job = initialJob;
	let attempt = 0;

	while (Date.now() < deadline) {
		const status = job.status?.toLowerCase();
		if (status === "done") return;
		if (status === "faulted") {
			throw new Error(`Oxylabs job ${job.id} faulted${faultDetails(job)}`);
		}

		await sleep(Math.min(pollDelay(attempt++), deadline - Date.now()));
		job = (await getJob(job.id!)) ?? job;
	}

	throw new Error(`Oxylabs job ${initialJob.id} timed out after ${OXYLABS_JOB_TIMEOUT_MS / 1000}s`);
}

async function fetchResults(jobId: string, deadline: number): Promise<OxylabsPayload> {
	let attempt = 0;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${OXYLABS_JOBS_URL}/${jobId}/results`, {
				headers: requestHeaders(),
			});
			if (res.ok) return (await res.json()) as OxylabsPayload;
			if (res.status !== 204 && !isTransientStatus(res.status)) {
				throw new Error(`Oxylabs results request failed (${await responseError(res)})`);
			}
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Oxylabs results request failed")) throw error;
		}

		await sleep(Math.min(pollDelay(attempt++), deadline - Date.now()));
	}

	throw new Error(`Oxylabs results for job ${jobId} were not ready before the job timeout`);
}

async function runAsyncQuery(body: Record<string, any>): Promise<OxylabsPayload> {
	const deadline = Date.now() + OXYLABS_JOB_TIMEOUT_MS;
	const job = await submitJob(body);
	await waitForJob(job, deadline);
	return fetchResults(job.id!, deadline);
}

function extractWebQueries(content: Record<string, any>): string[] {
	// Oxylabs exposes search queries under different keys depending on the source.
	for (const key of ["search_queries", "related_queries", "web_search_queries"]) {
		const arr = content[key];
		if (Array.isArray(arr)) {
			const queries = arr.filter((q: any) => typeof q === "string" && q.trim());
			if (queries.length > 0) return queries;
		}
	}
	return [];
}

export const oxylabs: Provider = {
	id: "oxylabs",
	name: "Oxylabs",

	isConfigured() {
		return !!process.env.OXYLABS_USERNAME && !!process.env.OXYLABS_PASSWORD;
	},

	validateTarget(config: ModelConfig) {
		if (!OXYLABS_SOURCES[config.model]) {
			return `Oxylabs does not support model "${config.model}". Supported: ${Object.keys(OXYLABS_SOURCES).join(", ")}`;
		}
		// ChatGPT has a web search toggle; Perplexity and Google AI Mode always search.
		if (!config.webSearch && config.model !== "chatgpt") {
			return `${config.model}:oxylabs requires :online — this chatbot always uses web search`;
		}
		return null;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const sourceConfig = OXYLABS_SOURCES[model];
		if (!sourceConfig) {
			throw new Error(
				`Oxylabs: no source mapping for model "${model}". Supported: ${Object.keys(OXYLABS_SOURCES).join(", ")}`,
			);
		}

		const body: Record<string, any> = {
			source: sourceConfig.source,
			[sourceConfig.field]: prompt,
			parse: true,
		};
		if (sourceConfig.render) body.render = sourceConfig.render;
		// ChatGPT's `search` flag toggles in-product web search. Other sources
		// always search, so we don't send the flag for them.
		if (model === "chatgpt") body.search = options?.webSearch ?? false;

		const payload = await runAsyncQuery(body);
		const content = payload.results?.[0]?.content ?? {};

		const textContent = extractTextFromOxylabs(payload);
		const citations: Citation[] = extractCitationsFromOxylabs(payload);
		const webQueries = extractWebQueries(content);

		return {
			rawOutput: payload,
			textContent,
			// When ChatGPT web search is disabled, no queries are expected.
			// Otherwise expose the queries Oxylabs surfaced, or mark "unavailable"
			// when citations prove a search happened but no queries were exposed.
			webQueries:
				model === "chatgpt" && !options?.webSearch
					? []
					: webQueries.length > 0
						? webQueries
						: citations.length > 0
							? ["unavailable"]
							: [],
			citations,
			modelVersion:
				typeof content.llm_model === "string"
					? content.llm_model
					: typeof content.model === "string"
						? content.model
						: undefined,
		};
	},
};
