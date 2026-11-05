import { BlockedHostError, type HttpResponse, httpRequest } from "./http";
import type { AuditProgress, RedirectHop } from "./types";

export interface FetchedResponse extends HttpResponse {
	kind: "response";
	/** The URL asked for; `url` is where the redirects ended. */
	requestedUrl: string;
	hops: RedirectHop[];
}

export interface FetchFailure {
	kind: "error";
	requestedUrl: string;
	message: string;
	blocked: boolean;
}

export interface FetchSkipped {
	kind: "skipped";
	requestedUrl: string;
	reason: "budget" | "robots" | "host-stopped";
}

export type Fetched = FetchedResponse | FetchFailure | FetchSkipped;

export interface FetchOptions {
	accept?: string;
	userAgent?: string;
	method?: "GET" | "HEAD";
	followRedirects?: boolean;
	maxBytes?: number;
	/** Robots checks fetch robots.txt itself, and bot-UA probes act as other bots. */
	ignoreRobots?: boolean;
}

export interface RobotsGate {
	isAllowed(url: string, userAgent: string): boolean | undefined;
	getCrawlDelay(userAgent: string): number | undefined;
}

const MAX_REDIRECTS = 5;
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 2;

interface HostState {
	nextSlotAt: number;
	consecutiveFailures: number;
	stopped: boolean;
	robots?: RobotsGate;
}

export interface FetcherOptions {
	requestLimit: number;
	delayMs: number;
	userAgent: string;
	signal?: AbortSignal;
	onProgress?: (event: AuditProgress) => void;
	allowPrivateNetwork?: boolean;
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Every request the audit makes goes through here: one budget, sequential per host, polite. */
export class Fetcher {
	used = 0;
	budgetExhausted = false;
	private readonly hosts = new Map<string, HostState>();
	private readonly cache = new Map<string, Promise<Fetched>>();
	private readonly sleep: (ms: number) => Promise<void>;
	private readonly robotsToken: string;

	constructor(private readonly options: FetcherOptions) {
		this.sleep = options.sleep ?? defaultSleep;
		this.robotsToken = options.userAgent.split("/")[0] ?? options.userAgent;
	}

	get limit(): number {
		return this.options.requestLimit;
	}

	setRobots(origin: string, robots: RobotsGate): void {
		this.host(origin).robots = robots;
	}

	get(url: string, options: FetchOptions = {}): Promise<Fetched> {
		const key = JSON.stringify([url, options.accept, options.userAgent, options.method, options.followRedirects]);
		let pending = this.cache.get(key);
		if (!pending) {
			pending = this.fetchFollowing(url, options);
			this.cache.set(key, pending);
		}
		return pending;
	}

	private host(origin: string): HostState {
		let state = this.hosts.get(origin);
		if (!state) {
			state = { nextSlotAt: 0, consecutiveFailures: 0, stopped: false };
			this.hosts.set(origin, state);
		}
		return state;
	}

	private async fetchFollowing(requestedUrl: string, options: FetchOptions): Promise<Fetched> {
		const hops: RedirectHop[] = [];
		let current = requestedUrl;
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			const outcome = await this.fetchOnce(current, options);
			if (outcome.kind !== "response") return { ...outcome, requestedUrl };
			const location = outcome.headers.location;
			const isRedirect = outcome.status >= 300 && outcome.status < 400 && location;
			if (!isRedirect || options.followRedirects === false) {
				return { ...outcome, kind: "response", requestedUrl, url: current, hops };
			}
			const next = new URL(location, current).toString();
			hops.push({ url: current, status: outcome.status, location: next });
			current = next;
		}
		return { kind: "error", requestedUrl, message: `More than ${MAX_REDIRECTS} redirects`, blocked: false };
	}

	private async fetchOnce(url: string, options: FetchOptions): Promise<Fetched> {
		const { origin } = new URL(url);
		const state = this.host(origin);
		const userAgent = options.userAgent ?? this.options.userAgent;
		if (state.stopped) return { kind: "skipped", requestedUrl: url, reason: "host-stopped" };
		if (!options.ignoreRobots && state.robots?.isAllowed(url, this.robotsToken) === false) {
			return { kind: "skipped", requestedUrl: url, reason: "robots" };
		}
		if (this.used >= this.options.requestLimit) {
			this.budgetExhausted = true;
			return { kind: "skipped", requestedUrl: url, reason: "budget" };
		}
		this.used++;

		const crawlDelayMs = (state.robots?.getCrawlDelay(this.robotsToken) ?? 0) * 1000;
		const gap = Math.max(this.options.delayMs, crawlDelayMs);
		const now = Date.now();
		const startAt = Math.max(now, state.nextSlotAt);
		state.nextSlotAt = startAt + gap;
		if (startAt > now) await this.sleep(startAt - now);
		this.options.signal?.throwIfAborted();
		this.options.onProgress?.({ type: "fetch", url, requestsUsed: this.used });

		try {
			const response = await httpRequest(
				{
					url,
					method: options.method,
					maxBytes: options.maxBytes,
					signal: this.options.signal,
					headers: {
						"user-agent": userAgent,
						accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
					},
				},
				this.options.allowPrivateNetwork,
			);
			// A bot-UA probe being refused is the finding, not a sign the host is struggling.
			if (!options.userAgent) this.noteStatus(state, response);
			return { kind: "response", requestedUrl: url, hops: [], ...response };
		} catch (error) {
			if (this.options.signal?.aborted) throw error;
			const blocked = error instanceof BlockedHostError;
			if (blocked || ++state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) state.stopped = true;
			return { kind: "error", requestedUrl: url, message: (error as Error).message, blocked };
		}
	}

	private noteStatus(state: HostState, response: HttpResponse): void {
		if (response.status === 429 || response.status === 503) {
			const retryAfter = Number(response.headers["retry-after"]);
			const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : Number.POSITIVE_INFINITY;
			if (waitMs > MAX_RETRY_AFTER_MS) state.stopped = true;
			else state.nextSlotAt = Math.max(state.nextSlotAt, Date.now() + waitMs);
		}
		if (response.status === 403 || response.status >= 500) {
			if (++state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) state.stopped = true;
		} else {
			state.consecutiveFailures = 0;
		}
	}
}
