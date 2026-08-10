import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { getCredential } from "../../secrets";
import { type Citation, cloroAnswer, extractCitationsFromCloro, extractTextFromCloro } from "../../text-extraction";
import {
	ProviderFatalError,
	providerHttpResponseError,
	ProviderResponseError,
	ProviderRunRejectedError,
	ProviderTaskFailedError,
	ProviderTaskPendingError,
} from "../errors";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";

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
// queue — which also meters concurrency for us, avoiding the 429s the
// synchronous endpoints return when the plan's concurrent-job limit is hit — and
// poll until the task settles rather than holding a connection open.
const CLORO_TASK_URL = "https://api.cloro.dev/v1/async/task";
const CLORO_POLL_WINDOW_MS = 30_000;
const CLORO_POLL_BASE_DELAY_MS = 2000;
const CLORO_POLL_MAX_DELAY_MS = 10_000;
const CLORO_RESUME_DELAY_MS = 30_000;
const CLORO_HTTP_TIMEOUT_MS = 30_000;
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

function pollDelay(attempt: number): number {
	return Math.min(CLORO_POLL_BASE_DELAY_MS * 2 ** Math.floor(attempt / 5), CLORO_POLL_MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function isFatalStatus(status: number): boolean {
	return status === 401 || status === 402 || status === 403;
}

async function responseError(res: Response): Promise<string> {
	return `${res.status}: ${(await res.text()).slice(0, 500)}`.trim();
}

function failureDetails(task: CloroTask): string {
	if (task.error === undefined || task.error === null) return "";
	const serialized = typeof task.error === "string" ? task.error : JSON.stringify(task.error);
	return serialized ? ` (${serialized.slice(0, 500)})` : "";
}

async function submitTask(taskType: string, payload: Record<string, any>, idempotencyKey?: string): Promise<CloroTask> {
	const res = await fetch(CLORO_TASK_URL, {
		method: "POST",
		headers: requestHeaders(),
		body: JSON.stringify({ taskType, payload, ...(idempotencyKey ? { idempotencyKey } : {}) }),
		signal: AbortSignal.timeout(CLORO_HTTP_TIMEOUT_MS),
	});

	if (!res.ok) {
		const message = `Cloro task submission failed (${await responseError(res)})`;
		throw providerHttpResponseError(message, res.status);
	}

	const body = (await res.json()) as { task?: CloroTask };
	if (!body.task?.id) throw new Error("Cloro task submission returned no task id");
	return body.task;
}

async function getTask(taskId: string): Promise<CloroTaskResponse | "not_found" | "pending" | null> {
	try {
		const res = await fetch(`${CLORO_TASK_URL}/${taskId}`, {
			headers: requestHeaders(),
			signal: AbortSignal.timeout(CLORO_HTTP_TIMEOUT_MS),
		});
		if (res.status === 204) return "pending";
		if (res.status === 404 || res.status === 410) return "not_found";
		if (isTransientStatus(res.status)) {
			throw new ProviderResponseError(`Cloro task status request failed (${await responseError(res)})`, {
				taskAccepted: true,
			});
		}
		if (!res.ok) {
			const message = `Cloro task status request failed (${await responseError(res)})`;
			throw isFatalStatus(res.status)
				? new ProviderFatalError(message, { taskAccepted: true })
				: new ProviderResponseError(message, { taskAccepted: true });
		}
		return (await res.json()) as CloroTaskResponse;
	} catch (error) {
		if (error instanceof ProviderFatalError || error instanceof ProviderResponseError) throw error;
		return null;
	}
}

async function runAsyncTask(
	taskType: string,
	payload: Record<string, any>,
	options?: ProviderOptions,
): Promise<Record<string, any>> {
	const invokedAt = Date.now();
	const deadline = invokedAt + CLORO_POLL_WINDOW_MS;

	let latest: CloroTaskResponse;
	let taskId: string;
	let sawStatusResponse = false;
	if (options?.externalTaskId) {
		taskId = options.externalTaskId;
		const existing = await getTask(taskId);
		if (existing === "not_found") {
			throw new ProviderTaskFailedError(`Cloro task ${taskId} no longer exists`);
		} else {
			sawStatusResponse = existing !== null;
			latest = existing === "pending" || existing === null ? { task: { id: taskId, status: "QUEUED" } } : existing;
		}
	} else {
		const submitted = await submitTask(taskType, payload, options?.idempotencyKey);
		taskId = submitted.id!;
		await options?.checkpointExternalTask?.(taskId);
		latest = { task: submitted };
	}
	let attempt = 0;

	while (true) {
		const status = latest.task?.status?.toUpperCase();
		if (status === "COMPLETED") return latest.response ?? {};
		if (status === "FAILED") {
			throw new ProviderTaskFailedError(`Cloro task ${taskId} failed${failureDetails(latest.task!)}`);
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			if (!sawStatusResponse) throw new Error(`Cloro task ${taskId} status was unavailable for 30 seconds`);
			throw new ProviderTaskPendingError(
				`Cloro task ${taskId} is still ${status ?? "unknown"} after ${Math.round((Date.now() - invokedAt) / 1000)}s`,
				CLORO_RESUME_DELAY_MS,
			);
		}

		await sleep(Math.min(pollDelay(attempt++), remaining));
		const polled = await getTask(taskId);
		if (polled === "not_found") throw new ProviderTaskFailedError(`Cloro task ${taskId} no longer exists`);
		if (polled !== null) sawStatusResponse = true;
		if (polled !== "pending" && polled !== null) latest = polled;
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

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const task = CLORO_TASKS[model];
		if (!task) {
			throw new ProviderRunRejectedError(
				`Cloro: no task mapping for model "${model}". Supported: ${Object.keys(CLORO_TASKS).join(", ")}`,
			);
		}

		const payload: Record<string, any> = { [task.field]: prompt, country: CLORO_COUNTRY };
		if (task.include) payload.include = task.include;

		const response = await runAsyncTask(task.taskType, payload, options);
		await options?.checkpointRawResponse?.({ rawOutput: response });
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
