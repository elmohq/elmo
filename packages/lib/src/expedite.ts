/**
 * Whether the scheduler's self-healing pass should drag a prompt's pending job
 * forward to run now.
 *
 * Expediting is for a prompt that has genuinely stalled — a job left behind by a
 * crashed worker, say. It is not for a prompt that is simply between cycles, and
 * getting that distinction wrong is expensive: the job it pulls forward re-runs
 * the whole fan-out, and every one of those runs is a paid provider call.
 *
 * The subtlety is that a failed run records nothing, so "when did this last
 * record a run?" cannot tell a healthy prompt from one whose provider is down —
 * it says "never" for both a brand-new prompt and one that has been retried four
 * hundred times. Asking when its next job was *scheduled* can, because that
 * happens whatever the outcome.
 */
export function shouldExpediteJob(params: {
	/** When the pending job was created — i.e. when the last cycle scheduled it. */
	jobCreatedAt: Date;
	/** Most recent recorded run across the prompt's models, if any. */
	lastRunAt: Date | null;
	runFrequencyMs: number;
	now: number;
	/** Floor on how often the same prompt may be expedited. */
	minIntervalMs: number;
}): boolean {
	const { jobCreatedAt, lastRunAt, runFrequencyMs, now, minIntervalMs } = params;

	// Scheduled recently, so this job is the previous cycle's own doing — either
	// the next run on cadence or a deliberate backoff after a failure. Pulling it
	// forward would override that backoff and, because a failing prompt never
	// stops looking overdue, would do so on every pass forever.
	if (now - jobCreatedAt.getTime() < minIntervalMs) return false;

	// Ran recently, so it isn't stalled either.
	if (lastRunAt && now - lastRunAt.getTime() < Math.min(runFrequencyMs, minIntervalMs)) return false;

	return true;
}
