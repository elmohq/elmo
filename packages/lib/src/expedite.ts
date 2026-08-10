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
 * hundred times. The failure streak on the job answers that, because a cycle
 * writes it whatever the outcome.
 *
 * Nothing here limits how often a prompt can be moved forward, because nothing
 * needs to: a cycle either records a run, which the run window then blocks on,
 * or fails, which sets the streak. Either way the next pass refuses.
 */
export function shouldExpediteJob(params: {
	/** Failure streak the pending job carries; > 0 means its delay is a backoff. */
	jobConsecutiveFailures: number;
	/** Most recent recorded run across the prompt's models, if any. */
	lastRunAt: Date | null;
	runFrequencyMs: number;
	now: number;
	/** Floor on how often the same prompt may be expedited. */
	minIntervalMs: number;
}): boolean {
	const { jobConsecutiveFailures, lastRunAt, runFrequencyMs, now, minIntervalMs } = params;

	// A job carrying a failure streak was delayed deliberately, by the backoff
	// the previous cycle chose. Pulling it forward doesn't heal anything — the
	// runs are failing, not missing — it just buys the same failure again sooner,
	// and a failing prompt never stops looking overdue, so it would do that on
	// every pass for as long as the outage lasts. The streak travels on the job
	// itself, so this is what the previous cycle decided rather than a guess.
	if (jobConsecutiveFailures > 0) return false;

	// Ran recently, so it isn't stalled either.
	if (lastRunAt && now - lastRunAt.getTime() < Math.min(runFrequencyMs, minIntervalMs)) return false;

	return true;
}
