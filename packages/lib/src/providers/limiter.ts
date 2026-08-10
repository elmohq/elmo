/**
 * Bounds how much work is in flight against a provider, and stops calling one
 * that is failing.
 *
 * Scrape providers bill per request, and the async ones accept far more
 * submissions than the plan can run at once — the surplus queues on their side
 * and is still billed when it finishes, whether or not the caller is still
 * waiting for the answer. Nothing else in the pipeline bounds the offered load:
 * a prompt job fans out RUNS_PER_PROMPT × targets requests at once and several
 * prompt jobs run concurrently, so a small plan sees hundreds of simultaneous
 * submissions where it can run a handful. Past that point every request ages
 * out in the provider's queue, each timeout is retried, and the retries make the
 * queue longer — a loop that bills for answers nobody ever reads.
 *
 * The gate holds the surplus here instead, where it costs nothing, so requests
 * are only submitted at a rate the provider can actually finish. The breaker is
 * the backstop for the case the gate can't help with: a provider that is
 * failing every call (out of credits, key revoked, upstream down) gets a
 * cooldown rather than the full fan-out, every cycle, forever.
 */

/** In-flight calls allowed per provider before the rest wait their turn. */
const DEFAULT_MAX_CONCURRENCY = 6;

/** Consecutive failures before a provider is put on cooldown. */
const BREAKER_FAILURE_THRESHOLD = 5;

/** How long a provider stays on cooldown after tripping the breaker. */
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Cooldown for a fatal error. Longer than the ordinary one because these don't
 * resolve on their own — an exhausted plan or a revoked key needs a human — so
 * retrying sooner only spends whatever budget is left.
 */
const FATAL_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * An error no amount of retrying will fix: the plan is out of credit, or the
 * credentials were rejected. Providers throw this instead of a bare Error so
 * the breaker can stop immediately rather than after the usual failure count.
 */
export class ProviderFatalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderFatalError";
	}
}

/** Thrown in place of a call while a provider is on cooldown. */
export class ProviderUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderUnavailableError";
	}
}

interface ProviderGate {
	/** Calls currently holding a slot. */
	active: number;
	/** Calls waiting for one, resolved in submission order. */
	waiters: (() => void)[];
	consecutiveFailures: number;
	/** Epoch ms until which calls fail fast; 0 when the breaker is closed. */
	openUntilMs: number;
}

const gates = new Map<string, ProviderGate>();

function gateFor(providerId: string): ProviderGate {
	let gate = gates.get(providerId);
	if (!gate) {
		gate = { active: 0, waiters: [], consecutiveFailures: 0, openUntilMs: 0 };
		gates.set(providerId, gate);
	}
	return gate;
}

/**
 * In-flight calls allowed per provider. Reads PROVIDER_MAX_CONCURRENCY; falls
 * back to DEFAULT_MAX_CONCURRENCY when unset, non-numeric, or <= 0.
 *
 * The default suits the entry-level plans self-hosters start on. Deployments
 * paying for more concurrency can raise it; the ceiling that matters is the
 * provider's, not ours.
 */
export function getProviderMaxConcurrency(): number {
	const raw = typeof process !== "undefined" ? process.env.PROVIDER_MAX_CONCURRENCY : undefined;
	if (!raw) return DEFAULT_MAX_CONCURRENCY;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_CONCURRENCY;
	return Math.floor(parsed);
}

async function acquire(gate: ProviderGate, max: number): Promise<void> {
	if (gate.active < max) {
		gate.active++;
		return;
	}
	// The slot is handed over directly by release(), which leaves `active`
	// untouched — incrementing here as well would double-count it, and letting
	// a later caller re-check `active < max` would let it jump the queue.
	await new Promise<void>((resolve) => gate.waiters.push(resolve));
}

function release(gate: ProviderGate): void {
	const next = gate.waiters.shift();
	if (next) {
		next();
		return;
	}
	gate.active--;
}

function recordSuccess(gate: ProviderGate): void {
	gate.consecutiveFailures = 0;
}

function recordFailure(gate: ProviderGate, providerId: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);

	if (error instanceof ProviderFatalError) {
		gate.openUntilMs = Date.now() + FATAL_COOLDOWN_MS;
		gate.consecutiveFailures = 0;
		console.error(
			`[providers] ${providerId} returned a fatal error — pausing for ${FATAL_COOLDOWN_MS / 60000}m: ${message}`,
		);
		return;
	}

	gate.consecutiveFailures++;
	if (gate.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
		gate.openUntilMs = Date.now() + BREAKER_COOLDOWN_MS;
		gate.consecutiveFailures = 0;
		console.error(
			`[providers] ${providerId} failed ${BREAKER_FAILURE_THRESHOLD} calls in a row — ` +
				`pausing for ${BREAKER_COOLDOWN_MS / 60000}m: ${message}`,
		);
	}
}

/**
 * Run a provider call under that provider's concurrency gate and breaker.
 *
 * Waiting for a slot happens before `fn` is invoked, so a queued call costs
 * nothing and its own timeouts don't start ticking until it actually runs.
 */
export async function withProviderSlot<T>(providerId: string, fn: () => Promise<T>): Promise<T> {
	const gate = gateFor(providerId);

	const openForMs = gate.openUntilMs - Date.now();
	if (openForMs > 0) {
		throw new ProviderUnavailableError(
			`Provider "${providerId}" is paused after repeated failures; retrying in ${Math.ceil(openForMs / 1000)}s`,
		);
	}

	await acquire(gate, getProviderMaxConcurrency());
	try {
		const result = await fn();
		recordSuccess(gate);
		return result;
	} catch (error) {
		recordFailure(gate, providerId, error);
		throw error;
	} finally {
		release(gate);
	}
}

/** Test seam: drops all gate state so cases don't inherit each other's breakers. */
export function resetProviderLimiters(): void {
	gates.clear();
}
