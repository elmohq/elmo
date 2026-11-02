/**
 * The `process-prompt` queue, defined once because both the worker and the web
 * app send to it and the two must agree: the options below are not tuning, they
 * are what stops a cycle being paid for twice.
 */

export const PROCESS_PROMPT_QUEUE = "process-prompt";

/**
 * Queue options for a process-prompt job, wherever it's scheduled from.
 *
 * The expiry has to outlast the whole fan-out. A cycle submits every one of its
 * runs at once and each is bounded by the provider's own task ceiling, so the
 * job runs for about as long as its slowest run — which, behind a provider
 * queue deep enough to matter, is that ceiling. If pg-boss expires the job it
 * cannot cancel the running promises, and a retry would pay for the fan-out a
 * second time.
 *
 * `retryLimit: 0` for the same reason from the other side. By the time this job
 * can fail it has already submitted paid requests, and a queue-level retry
 * re-submits the whole fan-out including the runs that succeeded. Recovery goes
 * through the handler's own backoff reschedule instead, or through
 * schedule-maintenance for a job that died before reaching it.
 */
export const PROMPT_JOB_OPTIONS = {
	retryLimit: 0,
	expireInSeconds: 90 * 60,
} as const;

/**
 * How long a send holds the prompt's singleton key when it isn't asking for a
 * specific next-attempt window. Long enough that a second send for the same
 * prompt is dropped rather than doubling the cycle.
 */
export const PROMPT_SINGLETON_SECONDS = 60 * 60;

export function promptSingletonKey(promptId: string): string {
	return `prompt-${promptId}`;
}
