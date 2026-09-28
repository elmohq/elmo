import { failureBackoffHours } from "../run-backoff";

/**
 * Ceiling on one prompt fan-out cycle, and therefore the queue expiry for
 * every process-prompt job — scheduled, immediate, and forced alike. A single
 * source so an operator-triggered run can never get a shorter window than the
 * cycle it pays for.
 */
export const PROMPT_RUN_MAX_SECONDS = 90 * 60;

/**
 * Shared pg-boss options for every process-prompt job and for the queue's own
 * defaults.
 *
 * `retryLimit: 0` (with retryDelay/retryBackoff pinned to their inert values
 * so no other default can sneak back in): by the time such a job can fail it
 * has already submitted paid provider requests, and a queue-level retry would
 * re-submit the whole fan-out including the runs that succeeded. Recovery
 * goes through the handler's own backoff reschedule, or through
 * schedule-maintenance for a job that died before reaching it.
 */
export const PROMPT_JOB_OPTIONS = {
	retryLimit: 0,
	retryDelay: 0,
	retryBackoff: false,
	expireInSeconds: PROMPT_RUN_MAX_SECONDS,
} as const;

/** The cadence chain's singleton key: one per prompt, shared by every sender. */
export function promptChainSingletonKey(promptId: string): string {
	return `prompt-${promptId}`;
}

export interface RescheduleDeps {
	/**
	 * pg-boss send. Resolves to the job id, or null when pg-boss throttled the
	 * send (a job with the same singleton key was created within the same
	 * singletonSeconds slot — including one that has already completed).
	 */
	send(
		queue: string,
		data: { promptId: string; consecutiveFailures: number },
		options: Record<string, unknown>,
	): Promise<string | null>;
	/** Ids of `created` process-prompt jobs with this key, oldest first. */
	listScheduledChainJobs(singletonKey: string): Promise<string[]>;
	/** pg-boss cancel of one `created` chain job (supported API, idempotent). */
	cancelChainJob(jobId: string): Promise<void>;
}

export type RescheduleOutcome =
	/** A future chain job already exists — nothing sent, no duplicate chain. */
	| { status: "existing" }
	/** One new chain job was created. */
	| { status: "scheduled"; jobId: string }
	/**
	 * The throttled send was resent without the slot throttle: pg-boss's
	 * singletonSeconds slot also counts jobs that already completed, which
	 * otherwise silently kills the chain (send resolves null, no job exists).
	 */
	| { status: "revived"; jobId: string };

/**
 * Converge on exactly one `created` chain job: keep the oldest, cancel the
 * rest. Concurrent revives can each pass the pre-check before any of them
 * commits (the unthrottled resend has no slot, so pg-boss cannot dedupe it on
 * a standard-policy queue); every racer runs this sweep, all compute the same
 * survivor, and cancelling an already-cancelled job is a no-op.
 */
async function convergeToOneChainJob(singletonKey: string, deps: RescheduleDeps): Promise<boolean> {
	const jobs = await deps.listScheduledChainJobs(singletonKey);
	for (const duplicate of jobs.slice(1)) await deps.cancelChainJob(duplicate);
	return jobs.length > 0;
}

/**
 * Idempotently ensure a prompt has EXACTLY ONE future cadence chain job.
 *
 * Every completion path (scheduled run, operator-forced run, no-targets-due
 * cycle) funnels through this, so a forced run can neither add a second chain
 * (an existing future job short-circuits before any send) nor kill the chain
 * (a null throttled send is verified and revived instead of trusted).
 * Scoped entirely by the prompt's own singleton key — other prompts' jobs are
 * never read or written.
 */
export async function ensureNextRunScheduled(
	promptId: string,
	cadenceHours: number,
	consecutiveFailures: number,
	deps: RescheduleDeps,
): Promise<RescheduleOutcome> {
	const delayHours = failureBackoffHours(consecutiveFailures, cadenceHours);
	return ensureChainJob(promptId, Math.round(delayHours * 60 * 60), consecutiveFailures, deps);
}

/**
 * The same exactly-one-chain guarantee for a chain that is being started
 * rather than continued: a prompt just created or re-enabled. The caller picks
 * the delay — zero for a single prompt, a share of the cadence when many
 * start at once — and a chain that already exists is left alone, so enabling
 * twice, or enabling while the previous chain's last job is still queued,
 * never doubles it.
 */
export async function ensureChainJob(
	promptId: string,
	startAfterSeconds: number,
	consecutiveFailures: number,
	deps: RescheduleDeps,
): Promise<RescheduleOutcome> {
	const singletonKey = promptChainSingletonKey(promptId);
	if (await convergeToOneChainJob(singletonKey, deps)) return { status: "existing" };

	const data = { promptId, consecutiveFailures };

	// A zero-second throttle slot is meaningless, so an immediate start uses the
	// hour slot every other sender of an immediate process-prompt job uses.
	const jobId = await deps.send("process-prompt", data, {
		singletonKey,
		singletonSeconds: startAfterSeconds > 0 ? startAfterSeconds : 60 * 60,
		startAfter: startAfterSeconds,
		...PROMPT_JOB_OPTIONS,
	});
	if (jobId !== null) {
		await convergeToOneChainJob(singletonKey, deps);
		return { status: "scheduled", jobId };
	}

	// Throttled. If a live future job exists after all (racing sender won), the
	// chain is intact; otherwise the slot was occupied by a finished job and the
	// chain must be revived with an unthrottled send.
	if (await convergeToOneChainJob(singletonKey, deps)) return { status: "existing" };
	const revivedId = await deps.send("process-prompt", data, {
		singletonKey,
		startAfter: startAfterSeconds,
		...PROMPT_JOB_OPTIONS,
	});
	if (revivedId === null) {
		throw new Error(`pg-boss dropped the unthrottled chain send for prompt ${promptId}`);
	}
	// Racing revivers can each insert an unthrottled job; converge afterwards.
	await convergeToOneChainJob(singletonKey, deps);
	return { status: "revived", jobId: revivedId };
}
