import type { Provider, ScrapeResult, ModelConfig } from "../types";
import { extractTextFromCloro, extractCitationsFromCloro, type Citation } from "../../text-extraction";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";

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
const CLORO_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const CLORO_POLL_BASE_DELAY_MS = 2000;
const CLORO_POLL_MAX_DELAY_MS = 10_000;
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
		Authorization: `Bearer ${process.env.CLORO_API_KEY}`,
		"Content-Type": "application/json",
	};
}

function pollDelay(attempt: number): number {
	return Math.min(CLORO_POLL_BASE_DELAY_MS * Math.pow(2, Math.floor(attempt / 5)), CLORO_POLL_MAX_DELAY_MS);
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
	const deadline = Date.now() + CLORO_TASK_TIMEOUT_MS;
	const submitted = await submitTask(taskType, payload);
	const taskId = submitted.id!;
	let latest: CloroTaskResponse = { task: submitted };
	let attempt = 0;

	while (Date.now() < deadline) {
		const status = latest.task?.status?.toUpperCase();
		if (status === "COMPLETED") return latest.response ?? {};
		if (status === "FAILED") {
			throw new Error(`Cloro task ${taskId} failed${failureDetails(latest.task!)}`);
		}

		await sleep(Math.min(pollDelay(attempt++), deadline - Date.now()));
		latest = (await getTask(taskId)) ?? latest;
	}

	throw new Error(`Cloro task ${taskId} timed out after ${CLORO_TASK_TIMEOUT_MS / 1000}s`);
}

// Google AI Overview nests the answer under `aioverview` (null when Google
// showed no overview); every chatbot task returns the answer fields at the top
// level of the task `response`.
function cloroAnswer(response: Record<string, any>): Record<string, any> {
	if (response && "aioverview" in response) return response.aioverview ?? {};
	return response ?? {};
}

// Cloro exposes the model's own web-search queries under different keys per
// surface: ChatGPT/Copilot use `searchQueries`, Perplexity `search_model_queries`.
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
		return !!process.env.CLORO_API_KEY;
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
		const answer = cloroAnswer(response);

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
