import { getCredential } from "../../secrets";
import { type Citation, cloroAnswer, extractCitationsFromCloro } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ScrapeResult } from "../types";
import { failureDetails, isTransientStatus, pollDelay, queriesFromKeys, responseError, sleep } from "./scrape-shared";

// Cloro monitors live AI answer engines. Each Elmo model maps to a Cloro task
// type: the chatbots (ChatGPT, Perplexity, Copilot, Gemini) and Google AI Mode
// send a `prompt`, while Google AI Overview rides on the Google Search task and
// sends a `query` with the AI Overview block requested. ChatGPT is the only
// surface that hides its fan-out queries behind an `include` flag.
type CloroTaskConfig = {
	taskType: string;
	field: "prompt" | "query";
	include: Record<string, unknown>;
	params?: Record<string, unknown>;
};

const CLORO_TASKS: Record<string, CloroTaskConfig> = {
	// ChatGPT's default mobile-web interface doesn't send its search queries to
	// the page, so `searchQueries` comes back empty without `legacy`, which asks
	// for the desktop interface that still streams them. Cloro documents it as
	// best-effort: OpenAI may stop serving that interface without notice.
	chatgpt: {
		taskType: "CHATGPT",
		field: "prompt",
		include: { markdown: true, searchQueries: true },
		params: { legacy: true },
	},
	perplexity: { taskType: "PERPLEXITY", field: "prompt", include: { markdown: true } },
	copilot: { taskType: "COPILOT", field: "prompt", include: { markdown: true } },
	gemini: { taskType: "GEMINI", field: "prompt", include: { markdown: true } },
	"google-ai-mode": { taskType: "AIMODE", field: "prompt", include: { markdown: true } },
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
 * Absolute ceiling per task, so a task that never settles can't pin a worker
 * forever. A submitted task is billed if it completes whether or not anyone is
 * still waiting, and Cloro retries a failing attempt by putting the task back in
 * the queue, so this is the only deadline: running or queued, a task gets the
 * full ceiling to reach COMPLETED or FAILED. Sized well above the deepest
 * backlog a single cycle can create — a cycle submits at most (prompt job
 * concurrency x RUNS_PER_PROMPT x targets) tasks at once — and within the
 * process-prompt job's expiry.
 */
const CLORO_TOTAL_TIMEOUT_MS = 60 * 60 * 1000;

// Cloro localizes every answer; default to a US audience.
const CLORO_COUNTRY = "US";

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
	let latest: CloroTaskResponse = { task: submitted };
	let attempt = 0;

	while (true) {
		// Settled states are checked before the deadlines, so an answer that
		// arrives on the last poll is returned rather than thrown away.
		const status = latest.task?.status?.toUpperCase();
		if (status === "COMPLETED") return latest.response ?? {};
		if (status === "FAILED") {
			// A failed task carries its error in `response`.
			throw new Error(`Cloro task ${taskId} failed${failureDetails(latest.response?.error ?? latest.task?.error)}`);
		}

		const remaining = hardDeadline - Date.now();
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
const CLORO_QUERY_KEYS = ["searchQueries", "search_model_queries", "mapSearchQueries"] as const;

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

		const response = await runAsyncTask(task.taskType, payload);
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
