import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { getCredential } from "../../secrets";
import { type Citation, cloroAnswer, extractCitationsFromCloro, extractTextFromCloro } from "../../text-extraction";
import type { ModelConfig, Provider, ScrapeResult } from "../types";

// Cloro monitors live AI answer engines. Each Elmo model maps to a Cloro task
// type: the chatbots (ChatGPT, Perplexity, Copilot, Gemini) and Google AI Mode
// send a `prompt`, while Google AI Overview rides on the Google Search task and
// sends a `query` with the AI Overview block requested. ChatGPT is the only
// surface that hides its fan-out queries behind an `include` flag.
type CloroTaskConfig = { taskType: string; field: "prompt" | "query"; include?: Record<string, unknown> };

const CLORO_TASKS: Record<string, CloroTaskConfig> = {
	chatgpt: { taskType: "CHATGPT", field: "prompt", include: { searchQueries: true } },
	perplexity: { taskType: "PERPLEXITY", field: "prompt" },
	copilot: { taskType: "COPILOT", field: "prompt" },
	gemini: { taskType: "GEMINI", field: "prompt" },
	"google-ai-mode": { taskType: "AIMODE", field: "prompt" },
	"google-ai-overview": { taskType: "GOOGLE", field: "query", include: { aioverview: { markdown: true } } },
};

// Answers can take minutes to generate, so submit through Cloro's async task
// queue and poll until the task settles rather than holding a connection open.
// The queue absorbs whatever is submitted past the plan's concurrent-job limit
// instead of returning the 429s the synchronous endpoints do, so a prompt cycle
// can put far more work in it than the plan runs at once and every bit of that
// is eventually run and billed.
const CLORO_TASK_URL = "https://api.cloro.dev/v1/async/task";

/**
 * How long a task gets once Cloro has actually started it.
 *
 * Time spent QUEUED is deliberately excluded. A submitted task is billed when it
 * completes whether or not anyone is still waiting for the answer, so giving up
 * on one that hasn't started yet pays full price for nothing — and, because the
 * caller then submits a replacement, makes the queue it was waiting behind
 * longer. Waiting for an answer already paid for is both cheaper and the only
 * behaviour that lets a backlog drain.
 */
const CLORO_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Absolute ceiling per task, so a queue that never drains can't pin a worker
 * forever. Sized well above the deepest backlog a single cycle can create: a
 * cycle submits at most (prompt job concurrency x RUNS_PER_PROMPT x targets)
 * tasks at once, and this has to cover the last of them reaching the front.
 */
const CLORO_TOTAL_TIMEOUT_MS = 60 * 60 * 1000;

const CLORO_POLL_BASE_DELAY_MS = 2000;
const CLORO_POLL_MAX_DELAY_MS = 10_000;
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

function pollDelay(attempt: number): number {
	return Math.min(CLORO_POLL_BASE_DELAY_MS * 2 ** Math.floor(attempt / 5), CLORO_POLL_MAX_DELAY_MS);
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

function failureDetails(task: CloroTask): string {
	if (task.error === undefined || task.error === null) return "";
	const serialized = typeof task.error === "string" ? task.error : JSON.stringify(task.error);
	return serialized ? ` (${serialized.slice(0, 500)})` : "";
}

async function submitTask(taskType: string, payload: Record<string, any>): Promise<CloroTask> {
	const res = await fetch(CLORO_TASK_URL, {
		method: "POST",
		headers: requestHeaders(),
		body: JSON.stringify({ taskType, payload }),
	});

	if (!res.ok) {
		throw new Error(`Cloro task submission failed (${await responseError(res)})`);
	}

	const body = (await res.json()) as { task?: CloroTask };
	if (!body.task?.id) throw new Error("Cloro task submission returned no task id");
	return body.task;
}

async function getTask(taskId: string): Promise<CloroTaskResponse | null> {
	try {
		const res = await fetch(`${CLORO_TASK_URL}/${taskId}`, { headers: requestHeaders() });
		if (res.status === 204 || isTransientStatus(res.status)) return null;
		if (!res.ok) {
			throw new Error(`Cloro task status request failed (${await responseError(res)})`);
		}
		return (await res.json()) as CloroTaskResponse;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Cloro task status request failed")) throw error;
		return null;
	}
}

async function runAsyncTask(taskType: string, payload: Record<string, any>): Promise<Record<string, any>> {
	const submitted = await submitTask(taskType, payload);
	const taskId = submitted.id!;
	const startedAt = Date.now();
	const hardDeadline = startedAt + CLORO_TOTAL_TIMEOUT_MS;
	let generationDeadline: number | null = null;
	let latest: CloroTaskResponse = { task: submitted };
	let attempt = 0;

	while (true) {
		// Settled states are checked before the deadlines, so an answer that
		// arrives on the last poll is returned rather than thrown away.
		const status = latest.task?.status?.toUpperCase();
		if (status === "COMPLETED") return latest.response ?? {};
		if (status === "FAILED") {
			throw new Error(`Cloro task ${taskId} failed${failureDetails(latest.task!)}`);
		}

		// An unreported status is treated as running: better to hold a task to
		// the generation budget than to let a status endpoint that answers
		// nothing keep it alive for the full ceiling.
		if (generationDeadline === null && !(status && CLORO_QUEUED_STATUSES.has(status))) {
			generationDeadline = Date.now() + CLORO_GENERATION_TIMEOUT_MS;
		}

		const remaining = Math.min(generationDeadline ?? hardDeadline, hardDeadline) - Date.now();
		if (remaining <= 0) {
			throw new Error(
				`Cloro task ${taskId} timed out after ${Math.round((Date.now() - startedAt) / 1000)}s ` +
					`in status ${status ?? "unknown"} (the task may still complete, and is billed if it does)`,
			);
		}

		await sleep(Math.min(pollDelay(attempt++), remaining));
		latest = (await getTask(taskId)) ?? latest;
	}
}

// Cloro exposes the model's own web-search queries under different keys per
// surface: ChatGPT/Copilot use `searchQueries`, Perplexity `search_model_queries`.
// Perplexity's entry is the prompt echoed back verbatim on every request seen so
// far, which is stored as-is rather than filtered here: web_queries holds what
// the provider reported, and the fan-out read path drops verbatim repeats. Its
// `related_queries` is deliberately not read — those are the follow-up questions
// Perplexity suggests below an answer, not searches it ran.
function extractWebQueries(answer: Record<string, any>): string[] {
	for (const key of ["searchQueries", "search_model_queries", "mapSearchQueries"]) {
		const arr = answer[key];
		if (Array.isArray(arr)) {
			const queries = arr.filter((q: any) => typeof q === "string" && q.trim());
			if (queries.length > 0) return queries;
		}
	}
	return [];
}

export const cloro: Provider = {
	id: "cloro",
	name: "Cloro",
	access: "scraped",
	docsAnchor: "cloro",

	isConfigured() {
		return !!getCredential("CLORO_API_KEY");
	},

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

		const payload: Record<string, any> = { [task.field]: prompt, country: CLORO_COUNTRY };
		if (task.include) payload.include = task.include;

		const response = await runAsyncTask(task.taskType, payload);
		const answer = cloroAnswer(response) ?? {};

		const textContent = extractTextFromCloro(response);
		const citations: Citation[] = extractCitationsFromCloro(response);
		const webQueries = extractWebQueries(answer);

		return {
			rawOutput: response,
			textContent,
			// Every Cloro surface web-searches, so surface the queries Cloro
			// exposed, or mark them unavailable when citations prove a search
			// happened but no query strings came back.
			webQueries: webQueries.length > 0 ? webQueries : citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
			citations,
			modelVersion: typeof answer.model === "string" ? answer.model : undefined,
		};
	},
};
