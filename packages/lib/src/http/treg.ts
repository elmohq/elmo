import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { tregConfigurationError, tregProviderSelected } from "@workspace/config/treg";
import { getCredential } from "../secrets";

const TIMEOUT_MS = 180_000;
const DFS_ROUTES: Record<string, string> = {
	"/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced":
		"dataforseo.x.ai-optimization-chat-gpt-llm-scraper-live-advanced",
	"/v3/ai_optimization/gemini/llm_scraper/live/advanced":
		"dataforseo.x.ai-optimization-gemini-llm-scraper-live-advanced",
	"/v3/serp/google/ai_mode/live/advanced": "dataforseo.x.serp-google-ai-mode-live-advanced",
	"/v3/serp/google/organic/live/advanced": "dataforseo.x.serp-google-organic-live-advanced",
	"/v3/ai_optimization/chat_gpt/llm_responses/live": "dataforseo.x.ai-optimization-chat-gpt-llm-responses-live",
	"/v3/ai_optimization/gemini/llm_responses/live": "dataforseo.x.ai-optimization-gemini-llm-responses-live",
	"/v3/ai_optimization/perplexity/llm_responses/live": "dataforseo.x.ai-optimization-perplexity-llm-responses-live",
};
const CLORO_ROUTES: Record<string, string> = {
	"/v1/async/task": "cloro.ai-search.chatgpt.scrape.task",
	"/v1/monitor/bing/aimode": "cloro.bing.serp.ai_mode",
	"/v1/monitor/gemini": "cloro.ai-search.gemini.scrape",
	"/v1/monitor/aimode": "cloro.google.serp.ai_mode",
	"/v1/monitor/google": "cloro.google.serp.organic",
};

type Receipt = {
	provider: string;
	endpoint: string;
	http_status: number | null;
	call_id: string | null;
	observed_charged_micro: number | null;
	original_cost_micro: number | null;
	replayed: boolean;
	idempotency_key: string | null;
};

type AuditScope = { requests: Receipt[]; keys: Map<string, string> };
const audit = new AsyncLocalStorage<AuditScope>();

export function isTregEnabled(providerId: string): boolean {
	return tregProviderSelected(providerId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function withTregAudit<T extends { rawOutput: unknown }>(
	providerId: string,
	operation: () => Promise<T>,
): Promise<T> {
	if (!isTregEnabled(providerId)) return operation();
	const scope: AuditScope = { requests: [], keys: new Map() };
	return audit.run(scope, async () => {
		const result = await operation();
		if (!isRecord(result.rawOutput)) return result;
		return { ...result, rawOutput: { ...result.rawOutput, _treg: { requests: scope.requests } } };
	});
}

function resolveRoute(providerId: string, request: Request): { endpoint: string; target: string } {
	const url = new URL(request.url);
	const origin = providerId === "cloro" ? "https://api.cloro.dev" : "https://api.dataforseo.com";
	if (url.origin !== origin || url.username || url.password || url.hash) {
		throw new Error("Treg refuses an unsupported native provider origin or URL");
	}
	if (providerId === "cloro" && request.method === "GET" && /^\/v1\/async\/task\/[\w-]+$/.test(url.pathname)) {
		return {
			endpoint: "cloro.ai-search.task.status",
			target: `https://treg.to/call/cloro${url.pathname}${url.search}`,
		};
	}
	const routes = providerId === "cloro" ? CLORO_ROUTES : DFS_ROUTES;
	const endpoint = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : undefined;
	if (request.method !== "POST" || !endpoint)
		throw new Error("Treg refuses an unsupported native provider method or path");
	return { endpoint, target: `https://treg.to/call/${endpoint}${url.search}` };
}

function validateBody(providerId: string, path: string, body: ArrayBuffer): void {
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder().decode(body));
	} catch {
		throw new Error("Treg requires a native JSON request body");
	}
	if (providerId === "dataforseo") {
		if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
			throw new Error("Treg DataForSEO live requests require exactly one task object in a JSON array");
		}
		return;
	}
	if (!isRecord(value)) throw new Error("Treg Cloro requests require a native JSON object");
	if (path === "/v1/async/task" && (value.taskType !== "CHATGPT" || !isRecord(value.payload))) {
		throw new Error("Treg Cloro async tasks support only CHATGPT with a native payload object");
	}
}

function observedCost(headers: Headers, name: string): number | null {
	const value = headers.get(name)?.trim();
	if (!value || !/^\d+$/.test(value)) return null;
	const cost = Number(value);
	return Number.isSafeInteger(cost) ? cost : null;
}

function requestKey(request: Request, body: ArrayBuffer | undefined): string | null {
	if (request.method !== "POST") return null;
	const fingerprint = createHash("sha256")
		.update(request.method)
		.update("\0")
		.update(request.url)
		.update("\0")
		.update(new Uint8Array(body ?? new ArrayBuffer(0)))
		.digest("hex");
	const keys = audit.getStore()?.keys;
	const key = keys?.get(fingerprint) ?? randomUUID();
	keys?.set(fingerprint, key);
	return key;
}

function requestHeaders(request: Request, providerId: string, key: string | null): Headers {
	const headers = new Headers();
	for (const name of ["Content-Type", "Accept"]) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	headers.set("X-Treg-Token", getCredential("TREG_API_KEY")?.trim() ?? "");
	const org = getCredential("TREG_ORG")?.trim();
	if (org) headers.set("X-Treg-Org", org);
	headers.set("X-Treg-Route-Max-Cost", getCredential("TREG_MAX_COST_USD")?.trim() ?? "");
	headers.set("X-Treg-Meta", `application=elmo,provider=${providerId}`);
	if (key) headers.set("Idempotency-Key", key);
	return headers;
}

class TregTransportError extends Error {
	constructor(
		message: string,
		readonly transient: boolean,
	) {
		super(message);
	}
}

export function isTregTransientError(error: unknown): boolean {
	return error instanceof TregTransportError && error.transient;
}

function transientRequestFailure(error: unknown, signal: AbortSignal, caller: AbortSignal): boolean {
	if (caller.aborted) return false;
	if (signal.reason?.name === "TimeoutError") return true;
	return (
		error instanceof TypeError &&
		error.message === "fetch failed" &&
		!(error.cause instanceof Error && error.cause.message === "unexpected redirect")
	);
}

function failure(receipt: Receipt, signal: AbortSignal, reason: string, transient = false): Error {
	const error = new TregTransportError(
		`Treg ${reason} (HTTP ${receipt.http_status ?? "unavailable"}; call ID ${receipt.call_id ?? "unavailable"}; idempotency key ${receipt.idempotency_key ?? "none"}). Reconcile before retrying; no automatic retry was attempted.`,
		transient,
	);
	if (signal.aborted) error.name = signal.reason?.name === "TimeoutError" ? "TimeoutError" : "AbortError";
	return error;
}

function requestDeadline(caller: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
	const controller = new AbortController();
	const abort = () => controller.abort(new DOMException("Request interrupted", "AbortError"));
	const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), TIMEOUT_MS);
	timer.unref?.();
	caller.addEventListener("abort", abort, { once: true });
	if (caller.aborted) abort();
	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timer);
			caller.removeEventListener("abort", abort);
		},
	};
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const abort = () => {
			signal.removeEventListener("abort", abort);
			reject(new Error("Request interrupted"));
		};
		promise.then(resolve, reject).then(() => signal.removeEventListener("abort", abort));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	});
}

async function requestBody(request: Request, signal: AbortSignal): Promise<ArrayBuffer> {
	if (!request.body) return new ArrayBuffer(0);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const chunk = await abortable(reader.read(), signal);
			if (chunk.done) break;
			chunks.push(chunk.value);
			size += chunk.value.byteLength;
		}
	} catch (error) {
		void reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	const body = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body.buffer;
}

function boundedResponse(response: Response, signal: AbortSignal, cleanup: () => void, receipt: Receipt): Response {
	if (!response.body) {
		cleanup();
		return response;
	}
	const reader = response.body.getReader();
	let closed = false;
	const finish = () => {
		closed = true;
		signal.removeEventListener("abort", abort);
		cleanup();
	};
	let abort: () => void;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			abort = () => {
				if (closed) return;
				finish();
				void reader.cancel().catch(() => {});
				controller.error(
					failure(receipt, signal, "response interrupted or timed out", signal.reason?.name === "TimeoutError"),
				);
			};
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
		},
		async pull(controller) {
			try {
				const chunk = await reader.read();
				if (closed) return;
				if (chunk.done) {
					finish();
					controller.close();
				} else controller.enqueue(chunk.value);
			} catch {
				if (closed) return;
				finish();
				controller.error(failure(receipt, signal, "response could not be read", true));
			}
		},
		cancel() {
			finish();
			return reader.cancel().catch(() => {});
		},
	});
	return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function logReceipt(receipt: Receipt): void {
	audit.getStore()?.requests.push(receipt);
	console.info(`[treg] ${JSON.stringify(receipt)}`);
}

function sanitizedResponse(response: Response, receipt: Receipt): Response {
	void response.body?.cancel().catch(() => {});
	const headers = new Headers({ "Content-Type": "application/json" });
	if (receipt.call_id) headers.set("X-Treg-Call-Id", receipt.call_id);
	const retryAfter = response.headers.get("Retry-After");
	if (retryAfter) headers.set("Retry-After", retryAfter);
	return new Response(JSON.stringify({ error: "Treg request failed", call_id: receipt.call_id }), {
		status: response.status,
		headers,
	});
}

export async function tregFetch(providerId: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	if (!isTregEnabled(providerId))
		throw new Error("Treg transport requires explicit provider selection in TREG_PROVIDERS");
	const configError = tregConfigurationError(providerId, {
		...process.env,
		TREG_API_KEY: getCredential("TREG_API_KEY"),
		TREG_MAX_COST_USD: getCredential("TREG_MAX_COST_USD"),
	});
	if (configError) throw new Error(configError);
	let request: Request;
	try {
		request = new Request(input, init);
	} catch {
		throw new Error("Treg requires a valid native provider request");
	}
	const route = resolveRoute(providerId, request);
	const { signal, cleanup } = requestDeadline(request.signal);
	const receipt: Receipt = {
		provider: providerId,
		endpoint: route.endpoint,
		http_status: null,
		call_id: null,
		observed_charged_micro: null,
		original_cost_micro: null,
		replayed: false,
		idempotency_key: null,
	};
	let body: ArrayBuffer | undefined;
	try {
		if (request.method === "POST") body = await requestBody(request, signal);
		if (signal.aborted) throw new Error("Request interrupted");
	} catch {
		cleanup();
		throw failure(receipt, signal, "request body interrupted or timed out");
	}
	try {
		if (body) validateBody(providerId, new URL(request.url).pathname, body);
	} catch (error) {
		cleanup();
		throw error;
	}
	receipt.idempotency_key = requestKey(request, body);
	let response: Response;
	try {
		response = await abortable(
			fetch(route.target, {
				method: request.method,
				headers: requestHeaders(request, providerId, receipt.idempotency_key),
				body,
				signal,
				redirect: "error",
				credentials: "omit",
			}),
			signal,
		);
	} catch (error) {
		cleanup();
		logReceipt(receipt);
		throw failure(
			receipt,
			signal,
			"request interrupted or timed out",
			transientRequestFailure(error, signal, request.signal),
		);
	}
	receipt.http_status = response.status;
	receipt.call_id = response.headers.get("X-Treg-Call-Id")?.trim() || null;
	receipt.observed_charged_micro = observedCost(response.headers, "X-Treg-Cost-Micro");
	receipt.original_cost_micro = observedCost(response.headers, "X-Treg-Original-Cost-Micro");
	receipt.replayed = response.headers.get("X-Treg-Idempotent-Replay")?.toLowerCase() === "true";
	logReceipt(receipt);
	if (!response.ok) {
		cleanup();
		return sanitizedResponse(response, receipt);
	}
	if (!receipt.call_id) {
		cleanup();
		void response.body?.cancel().catch(() => {});
		throw failure(receipt, signal, "response is missing its audit call ID");
	}
	return boundedResponse(response, signal, cleanup, receipt);
}
