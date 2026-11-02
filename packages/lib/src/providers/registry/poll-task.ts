/**
 * Waiting for a vendor's async task to settle.
 *
 * Three providers submit work to a queue and poll it — BrightData snapshots,
 * Cloro tasks, Oxylabs jobs — and all three wrote the same loop with their own
 * vocabulary, their own timeouts and their own rules for a status nobody
 * recognised. The rules worth getting right were each reasoned out in one of
 * them and missing from the others, so they live here instead, and a provider
 * contributes only the part that is genuinely its own: what its status strings
 * mean.
 *
 * The rules, in one place:
 *
 * - **A settled task is read before a deadline is enforced.** An answer that
 *   arrives on the last poll is an answer, and it has been paid for.
 * - **An unrecognised status means "running", not "broken".** A vendor adding a
 *   status string must not fail every run on its first poll.
 * - **A status read that fails says nothing.** Keep the last known status and
 *   keep polling; a flaky status endpoint is not a failed task.
 * - **Time spent queued can be budgeted separately from time spent running.**
 *   A task is billed when it completes whether or not anyone is still waiting,
 *   so giving up on one that hasn't started pays full price for nothing — and
 *   the replacement the caller submits makes the queue it was waiting behind
 *   longer.
 */

import { pollDelay, sleep as realSleep } from "./scrape-shared";

export type TaskState =
	/** Accepted by the vendor, not started. Spends the total budget only. */
	| "queued"
	/** Started, or in a state we don't recognise and treat as started. */
	| "running"
	| "ready"
	| "failed";

export interface PollTaskOptions<T> {
	/** How the task is named in errors — "Cloro task abc123". */
	describe: string;
	/** A status the submit response already carried, so the first poll isn't wasted. */
	initial?: T;
	/** One status read. Null means the read told us nothing; the last status stands. */
	poll: () => Promise<T | null>;
	classify: (payload: T) => TaskState;
	/** The vendor's own word for a failed task, when it has one worth repeating. */
	failureVerb?: string;
	/** Vendor detail appended to the failure message. */
	describeFailure?: (payload: T) => string;
	/**
	 * The vendor's own status, for the timeout message. Where a task stopped is
	 * what an operator needs — "stuck in QUEUED" and "stuck in PROCESSING" are
	 * different problems — and the classified state is too coarse to say.
	 */
	describeStatus?: (payload: T | undefined) => string;
	/** Ceiling on the whole wait, so a queue that never drains can't pin a worker. */
	totalTimeoutMs: number;
	/** Budget that starts when the task first looks started. Omit to use the total only. */
	runningTimeoutMs?: number;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

function taskFailed<T>(options: PollTaskOptions<T>, latest: T): Error {
	const detail = options.describeFailure?.(latest) ?? "";
	return new Error(`${options.describe} ${options.failureVerb ?? "failed"}${detail}`);
}

function taskTimedOut<T>(options: PollTaskOptions<T>, latest: T | undefined, elapsedMs: number): Error {
	const where = options.describeStatus ? ` in status ${options.describeStatus(latest)}` : "";
	return new Error(
		`${options.describe} timed out after ${Math.round(elapsedMs / 1000)}s${where} ` +
			`(the task may still complete, and is billed if it does)`,
	);
}

/**
 * What the latest status means, read before any deadline is enforced: an answer
 * that arrives on the last poll is an answer, and it has been paid for.
 */
function inspect<T>(options: PollTaskOptions<T>, latest: T | undefined): { settled: T } | { running: boolean } {
	if (latest === undefined) return { running: false };
	const state = options.classify(latest);
	if (state === "ready") return { settled: latest };
	if (state === "failed") throw taskFailed(options, latest);
	return { running: state === "running" };
}

/** The last status read, once it classifies as `ready`. */
export async function pollTask<T>(options: PollTaskOptions<T>): Promise<T> {
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? realSleep;

	const startedAt = now();
	const hardDeadline = startedAt + options.totalTimeoutMs;
	let runningDeadline: number | null = null;
	let latest = options.initial;
	let attempt = 0;

	while (true) {
		const step = inspect(options, latest);
		if ("settled" in step) return step.settled;
		if (step.running && runningDeadline === null && options.runningTimeoutMs !== undefined) {
			runningDeadline = now() + options.runningTimeoutMs;
		}

		const remaining = Math.min(runningDeadline ?? hardDeadline, hardDeadline) - now();
		if (remaining <= 0) throw taskTimedOut(options, latest, now() - startedAt);

		await sleep(Math.min(pollDelay(attempt++), remaining));
		latest = (await options.poll()) ?? latest;
	}
}
