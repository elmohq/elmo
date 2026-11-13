import { getCredential } from "../../secrets";
import { type Citation, extractCitationsFromOxylabs } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import { pollTask, type TaskState } from "./poll-task";
import {
	failureDetails,
	hasWebSearchToggle,
	isTransientStatus,
	pollDelay,
	queriesFromKeys,
	responseError,
	searchesWeb,
	sleep,
} from "./scrape-shared";

// Oxylabs Web Scraper API sources for AI surfaces.
// ChatGPT uses `prompt`; the Google surfaces use `query` and
// require `render: html` — AI Mode via the `google_ai_mode` source, AI Overview
// via a `google_search` SERP whose parsed result carries the overview block.
const OXYLABS_SOURCES: Record<string, { source: string; field: "prompt" | "query"; render?: string }> = {
	chatgpt: { source: "chatgpt", field: "prompt" },
	"google-ai-mode": { source: "google_ai_mode", field: "query", render: "html" },
	"google-ai-overview": { source: "google_search", field: "query", render: "html" },
};

// AI answers can outlive the Realtime API's connection TTL. Use single-job
// Push-Pull for every source; ChatGPT does not support batch jobs.
const OXYLABS_JOBS_URL = "https://data.oxylabs.io/v1/queries";
const OXYLABS_JOB_TIMEOUT_MS = 10 * 60 * 1000;

interface OxylabsJob {
	id?: string;
	status?: string;
	statuses?: unknown;
}

interface OxylabsPayload {
	results?: Array<{ content?: Record<string, any> }>;
}

function basicAuthHeader(): string {
	const token = btoa(`${getCredential("OXYLABS_USERNAME")}:${getCredential("OXYLABS_PASSWORD")}`);
	return `Basic ${token}`;
}

function requestHeaders(): Record<string, string> {
	return {
		Authorization: basicAuthHeader(),
		"Content-Type": "application/json",
	};
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

function oxylabsJobState(job: OxylabsJob): TaskState {
	const status = job.status?.toLowerCase();
	if (status === "done") return "ready";
	if (status === "faulted") return "failed";
	return "running";
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

	await pollTask<OxylabsJob>({
		describe: `Oxylabs job ${job.id}`,
		initial: job,
		poll: () => getJob(job.id!),
		classify: oxylabsJobState,
		failureVerb: "faulted",
		describeFailure: (latest) => failureDetails(latest.statuses),
		totalTimeoutMs: OXYLABS_JOB_TIMEOUT_MS,
	});

	// Results can lag the job reaching `done`, so they share the job's deadline
	// rather than getting one of their own.
	return fetchResults(job.id!, deadline);
}

// Oxylabs exposes search queries under different keys depending on the source.
const OXYLABS_QUERY_KEYS = ["search_queries", "web_search_queries"] as const;

export const oxylabs: Provider = {
	id: "oxylabs",
	name: "Oxylabs",
	access: "scraped",
	docsAnchor: "oxylabs",

	isConfigured: configuredWhen("OXYLABS_USERNAME", "OXYLABS_PASSWORD"),

	validateTarget(config: ModelConfig) {
		if (!OXYLABS_SOURCES[config.model]) {
			return `Oxylabs does not support model "${config.model}". Supported: ${Object.keys(OXYLABS_SOURCES).join(", ")}`;
		}
		if (!config.webSearch && !hasWebSearchToggle(config.model)) {
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
		if (hasWebSearchToggle(model)) body.search = options?.webSearch ?? false;

		const payload = await runAsyncQuery(body);
		const content = payload.results?.[0]?.content ?? {};

		const citations: Citation[] = extractCitationsFromOxylabs(payload);
		const webQueries = queriesFromKeys(content, OXYLABS_QUERY_KEYS);

		return {
			rawOutput: payload,
			webQueries: reportedWebQueries(webQueries, {
				webSearch: searchesWeb(model, options?.webSearch),
				searchProven: citations.length > 0,
			}),
			modelVersion:
				typeof content.llm_model === "string"
					? content.llm_model
					: typeof content.model === "string"
						? content.model
						: undefined,
		};
	},
};
