import { pollDelay, sleep as realSleep } from "./scrape-shared";

export type TaskState = "queued" | "running" | "ready" | "failed";

export interface PollTaskOptions<T> {
	describe: string;
	initial?: T;
	poll: () => Promise<T | null>;
	classify: (payload: T) => TaskState;
	failureVerb?: string;
	describeFailure?: (payload: T) => string;
	describeStatus?: (payload: T | undefined) => string;
	totalTimeoutMs: number;
	// Queued time is excluded: an abandoned task is still billed when it completes,
	// so giving up on one that never started pays for nothing.
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

// Checked before any deadline so an answer that lands on the last poll is kept.
function inspect<T>(options: PollTaskOptions<T>, latest: T | undefined): { settled: T } | { running: boolean } {
	if (latest === undefined) return { running: false };
	const state = options.classify(latest);
	if (state === "ready") return { settled: latest };
	if (state === "failed") throw taskFailed(options, latest);
	return { running: state === "running" };
}

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
