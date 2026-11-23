import { isTregEnabled, isTregTransientError, tregFetch } from "../../http/treg";
import { getCredential } from "../../secrets";
import { type Citation, cloroAnswer, extractCitationsFromCloro } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ScrapeResult } from "../types";
import { pollTask, type TaskState } from "./poll-task";
import { failureDetails, isTransientStatus, queriesFromKeys, responseError } from "./scrape-shared";

// Google AI Overview rides on the Google Search task, so it sends a `query`
// rather than a `prompt`.
type CloroTaskConfig = {
	taskType: string;
	field: "prompt" | "query";
	include: Record<string, unknown>;
	params?: Record<string, unknown>;
};

const CLORO_TASKS: Record<string, CloroTaskConfig> = {
	// Only ChatGPT's `legacy` desktop interface streams its search queries. Cloro
	// calls it best-effort: OpenAI may stop serving it without notice.
	chatgpt: {
		taskType: "CHATGPT",
		field: "prompt",
		include: { markdown: true, searchQueries: true },
		params: { legacy: true },
	},
	// bing.com/copilotsearch. Cloro's COPILOT task reads the Copilot app, which now requires a login.
	"bing-ai-mode": { taskType: "BING_AIMODE", field: "prompt", include: { markdown: true } },
	gemini: { taskType: "GEMINI", field: "prompt", include: { markdown: true } },
	"google-ai-mode": { taskType: "AIMODE", field: "prompt", include: { markdown: true } },
	"google-ai-overview": { taskType: "GOOGLE", field: "query", include: { aioverview: { markdown: true } } },
};

// Answers can take minutes, so tasks go through the async queue. It absorbs work
// past the plan's concurrency rather than 429ing, and everything queued is billed.
const CLORO_TASK_URL = "https://api.cloro.dev/v1/async/task";

const CLORO_SYNC_TREG_PATHS: Record<string, string> = {
	"bing-ai-mode": "/v1/monitor/bing/aimode",
	gemini: "/v1/monitor/gemini",
	"google-ai-mode": "/v1/monitor/aimode",
	"google-ai-overview": "/v1/monitor/google",
};

// Sync calls lack Cloro's async concurrency queue; keep only a bounded FIFO locally.
const CLORO_SYNC_TREG_QUEUE_LIMIT = 128;
let syncTregPending = 0;
let syncTregTail: Promise<void> = Promise.resolve();

async function queueSyncTreg<T>(run: () => Promise<T>): Promise<T> {
	if (syncTregPending >= CLORO_SYNC_TREG_QUEUE_LIMIT) throw new Error("Cloro Treg sync queue is full");
	syncTregPending++;
	const result = syncTregTail.then(run);
	syncTregTail = result.then(
		() => {
			syncTregPending--;
		},
		() => {
			syncTregPending--;
		},
	);
	return result;
}

/**
 * Excludes time spent queued: a task is billed whether or not anyone waits for
 * it, and abandoning one only queues a replacement behind it.
 */
const CLORO_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

/** Sized past the deepest backlog one cycle can queue, so a queue that never drains can't pin a worker. */
const CLORO_TOTAL_TIMEOUT_MS = 60 * 60 * 1000;

// Cloro localizes every answer; default to a US audience.
const CLORO_COUNTRY = "US";

/** Statuses meaning "accepted, not started" — see CLORO_GENERATION_TIMEOUT_MS. */
const CLORO_QUEUED_STATUSES = new Set(["QUEUED", "PENDING", "CREATED", "SCHEDULED"]);

interface CloroTask {
	id?: string;
	status?: string;
	error?: unknown;
}

interface CloroTaskResponse {
	task?: CloroTask;
	response?: Record<string, any>;
}

function requestHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getCredential("CLORO_API_KEY")}`,
		"Content-Type": "application/json",
	};
}

async function submitTask(taskType: string, payload: Record<string, any>): Promise<CloroTask> {
	const init = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ taskType, payload }),
	};
	const res = isTregEnabled("cloro")
		? await tregFetch("cloro", CLORO_TASK_URL, init)
		: await fetch(CLORO_TASK_URL, { ...init, headers: requestHeaders() });

	if (!res.ok) {
		throw new Error(`Cloro task submission failed (${await responseError(res)})`);
	}

	const body = (await res.json()) as { task?: CloroTask };
	if (!body.task?.id) throw new Error("Cloro task submission returned no task id");
	return body.task;
}

async function getTask(taskId: string): Promise<CloroTaskResponse | null> {
	const gateway = isTregEnabled("cloro");
	try {
		const res = gateway
			? await tregFetch("cloro", `${CLORO_TASK_URL}/${encodeURIComponent(taskId)}`)
			: await fetch(`${CLORO_TASK_URL}/${taskId}`, { headers: requestHeaders() });
		if (res.status === 204 || isTransientStatus(res.status)) return null;
		if (!res.ok) {
			throw new Error(`Cloro task status request failed (${await responseError(res)})`);
		}
		return (await res.json()) as CloroTaskResponse;
	} catch (error) {
		if (gateway && !isTregTransientError(error)) throw error;
		if (error instanceof Error && error.message.startsWith("Cloro task status request failed")) throw error;
		return null;
	}
}

function cloroTaskState(payload: CloroTaskResponse): TaskState {
	const status = payload.task?.status?.toUpperCase();
	if (status === "COMPLETED") return "ready";
	if (status === "FAILED") return "failed";
	// An unreported status counts as running so a silent status endpoint can't
	// keep the task alive for the full ceiling.
	return status && CLORO_QUEUED_STATUSES.has(status) ? "queued" : "running";
}

async function runAsyncTask(taskType: string, payload: Record<string, any>): Promise<Record<string, any>> {
	const submitted = await submitTask(taskType, payload);
	const taskId = submitted.id!;

	const settled = await pollTask<CloroTaskResponse>({
		describe: `Cloro task ${taskId}`,
		initial: { task: submitted },
		poll: () => getTask(taskId),
		classify: cloroTaskState,
		describeFailure: (latest) => failureDetails(latest.task?.error),
		describeStatus: (latest) => latest?.task?.status?.toUpperCase() ?? "unknown",
		totalTimeoutMs: CLORO_TOTAL_TIMEOUT_MS,
		runningTimeoutMs: CLORO_GENERATION_TIMEOUT_MS,
	});

	return settled?.response ?? {};
}

async function runSyncTreg(model: string, prompt: string): Promise<Record<string, any>> {
	const path = CLORO_SYNC_TREG_PATHS[model];
	if (!path) throw new Error("Cloro Treg does not support this sync model");
	if (!prompt.trim()) throw new Error("Cloro Treg requires a nonempty prompt");
	if (model === "bing-ai-mode" && encodeURIComponent(prompt).length > 3500) {
		throw new Error("Cloro Bing AI Mode prompts must be 3500 URL-encoded characters or fewer");
	}
	if ((model === "gemini" || model === "google-ai-mode") && Array.from(prompt).length > 10000) {
		throw new Error("Cloro Treg prompts must be 10000 characters or fewer");
	}
	const google = model === "google-ai-mode" || model === "google-ai-overview";
	const task = CLORO_TASKS[model];
	const payload = {
		[task.field]: prompt,
		...(google ? { gl: CLORO_COUNTRY } : { country: CLORO_COUNTRY }),
		include: task.include,
	};
	return queueSyncTreg(async () => {
		const res = await tregFetch("cloro", `https://api.cloro.dev${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(CLORO_GENERATION_TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`Cloro Treg sync request failed (${res.status})`);
		let body: { success?: boolean; result?: Record<string, any> } | null;
		try {
			body = await res.json();
		} catch {
			throw new Error("Cloro Treg sync response was not valid JSON");
		}
		const response = body?.result;
		if (body?.success !== true || !response || typeof response !== "object" || Array.isArray(response)) {
			throw new Error("Cloro Treg sync response contained no result");
		}
		const answer = model === "google-ai-overview" ? response.aioverview : cloroAnswer(response);
		if (!answer || ![answer.markdown, answer.text].some((value) => typeof value === "string" && value.trim())) {
			throw new Error("Cloro Treg sync response contained no usable answer");
		}
		return response;
	});
}

const CLORO_QUERY_KEYS = ["searchQueries", "mapSearchQueries"] as const;

export const cloro: Provider = {
	id: "cloro",
	name: "Cloro",
	access: "scraped",
	docsAnchor: "cloro",

	isConfigured: configuredWhen("CLORO_API_KEY"),

	validateTarget(config: ModelConfig) {
		if (!CLORO_TASKS[config.model]) {
			return `Cloro does not support model "${config.model}". Supported: ${Object.keys(CLORO_TASKS).join(", ")}`;
		}
		// Cloro scrapes the live answer engines, all of which web-search.
		if (!config.webSearch) {
			return `${config.model}:cloro requires :online — Cloro tracks the live web-search UIs`;
		}
		return null;
	},

	async run(model: string, prompt: string): Promise<ScrapeResult> {
		const task = CLORO_TASKS[model];
		if (!task) {
			throw new Error(`Cloro: no task mapping for model "${model}". Supported: ${Object.keys(CLORO_TASKS).join(", ")}`);
		}

		const payload: Record<string, any> = {
			[task.field]: prompt,
			country: CLORO_COUNTRY,
			include: task.include,
			...task.params,
		};

		const response =
			isTregEnabled("cloro") && model !== "chatgpt"
				? await runSyncTreg(model, prompt)
				: await runAsyncTask(task.taskType, payload);
		const answer = cloroAnswer(response) ?? {};

		const citations: Citation[] = extractCitationsFromCloro(response);
		const webQueries = queriesFromKeys(answer, CLORO_QUERY_KEYS);

		return {
			rawOutput: response,
			// Every Cloro surface web-searches, so surface the queries Cloro
			// exposed, or mark them unavailable when citations prove a search
			// happened but no query strings came back.
			webQueries: reportedWebQueries(webQueries, { searchProven: citations.length > 0 }),
			modelVersion: typeof answer.model === "string" ? answer.model : undefined,
		};
	},
};
