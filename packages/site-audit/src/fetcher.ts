import { BlockedHostError, type HttpResponse, httpRequest } from "./http";
import type { ParsedRobots } from "./parse/robots";
import type { AuditProgress, RedirectHop } from "./types";

export interface FetchedResponse extends HttpResponse {
	kind: "response";
	/** The URL asked for; `url` is where the redirects ended. */
	requestedUrl: string;
	hops: RedirectHop[];
}

interface FetchFailure {
	kind: "error";
	requestedUrl: string;
	message: string;
	blocked: boolean;
}

export interface FetchSkipped {
	kind: "skipped";
	requestedUrl: string;
	reason: "budget" | "robots" | "crawl-delay" | "host-stopped";
}

export type Fetched = FetchedResponse | FetchFailure | FetchSkipped;

export interface FetchOptions {
	accept?: string;
	userAgent?: string;
	method?: "GET" | "HEAD";
	followRedirects?: boolean;
	maxBytes?: number;
	ignoreRobots?: boolean;
}

const MAX_REDIRECTS = 5;
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_CRAWL_DELAY_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 2;

interface HostState {
	nextSlotAt: number;
	consecutiveFailures: number;
	stopped: boolean;
	robots?: ParsedRobots;
}

interface FetcherOptions {
	requestLimit: number;
	delayMs: number;
	userAgent: string;
	signal?: AbortSignal;
	onProgress?: (event: AuditProgress) => void;
	allowPrivateNetwork?: boolean;
	sleep?: (ms: number) => Promise<void>;
}

function abortableSleep(signal: AbortSignal | undefined) {
	return (ms: number) =>
		new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, ms);
			signal?.addEventListener(
				"abort",
				() => {
					clearTimeout(timer);
					reject(signal.reason);
				},
				{ once: true },
			);
		});
}

export class Fetcher {
	used = 0;
	budgetExhausted = false;
	private readonly hosts = new Map<string, HostState>();
	private readonly cache = new Map<string, Promise<Fetched>>();
	private readonly sleep: (ms: number) => Promise<void>;
	readonly robotsToken: string;

	constructor(private readonly options: FetcherOptions) {
		this.sleep = options.sleep ?? abortableSleep(options.signal);
		this.robotsToken = options.userAgent.split("/")[0] ?? options.userAgent;
	}

	get limit(): number {
		return this.options.requestLimit;
	}

	stopped(origin: string): boolean {
		return this.hosts.get(origin)?.stopped === true;
	}

	setRobots(origin: string, robots: ParsedRobots): void {
		this.host(origin).robots = robots;
	}

	get(url: string, options: FetchOptions = {}): Promise<Fetched> {
		const key = JSON.stringify([
			url,
			options.accept,
			options.userAgent,
			options.method,
			options.followRedirects,
			options.maxBytes,
		]);
		let pending = this.cache.get(key);
		if (!pending) {
			// A malformed URL from the site (a bad redirect Location, sitemap <loc>, or link) is that page's error, not the audit's.
			pending = this.fetchFollowing(url, options).catch((error: Error): Fetched => {
				if (this.options.signal?.aborted) throw error;
				return { kind: "error", requestedUrl: url, message: error.message, blocked: false };
			});
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
		const skip = this.skipReason(url, state, options);
		if (skip) return { kind: "skipped", requestedUrl: url, reason: skip };
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
			this.noteStatus(state, response, Boolean(options.userAgent));
			return { kind: "response", requestedUrl: url, hops: [], ...response };
		} catch (error) {
			if (this.options.signal?.aborted) throw error;
			const blocked = error instanceof BlockedHostError;
			if (blocked) state.stopped = true;
			else if (!options.userAgent && ++state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) state.stopped = true;
			return { kind: "error", requestedUrl: url, message: (error as Error).message, blocked };
		}
	}

	private skipReason(url: string, state: HostState, options: FetchOptions): FetchSkipped["reason"] | undefined {
		if (state.stopped) return "host-stopped";
		if (!options.ignoreRobots && state.robots?.isAllowed(url, this.robotsToken) === false) return "robots";
		if ((state.robots?.getCrawlDelay(this.robotsToken) ?? 0) * 1000 > MAX_CRAWL_DELAY_MS) return "crawl-delay";
		if (this.used >= this.options.requestLimit) {
			this.budgetExhausted = true;
			return "budget";
		}
		return undefined;
	}

	// A bot-UA probe being refused (403, or a 503 challenge page) is the finding, not a
	// sign the host is struggling, so only a 429 aimed at it slows the audit down.
	private noteStatus(state: HostState, response: HttpResponse, isProbe: boolean): void {
		const throttled = response.status === 429 || (response.status === 503 && !isProbe);
		if (throttled) {
			const retryAfter = Number(response.headers["retry-after"]);
			const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : Number.POSITIVE_INFINITY;
			if (waitMs > MAX_RETRY_AFTER_MS) state.stopped = true;
			else state.nextSlotAt = Math.max(state.nextSlotAt, Date.now() + waitMs);
		}
		if (isProbe) return;
		if (response.status === 403 || response.status >= 500) {
			if (++state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) state.stopped = true;
		} else {
			state.consecutiveFailures = 0;
		}
	}
}
