/**
 * Only for a genuinely stalled prompt: every expedited run is a paid provider
 * call. A failed run records nothing, so the job's failure streak is what tells a
 * stalled prompt from a failing one. Either outcome of a cycle blocks the next pass.
 */
export function shouldExpediteJob(params: {
	/** Failure streak the pending job carries; > 0 means its delay is a backoff. */
	jobConsecutiveFailures: number;
	lastRunAt: Date | null;
	runFrequencyMs: number;
	now: number;
	/** Floor on how often the same prompt may be expedited. */
	minIntervalMs: number;
}): boolean {
	const { jobConsecutiveFailures, lastRunAt, runFrequencyMs, now, minIntervalMs } = params;

	// A failure streak means the delay is a deliberate backoff; pulling it forward
	// just buys the same failure sooner, on every pass of an outage.
	if (jobConsecutiveFailures > 0) return false;

	if (lastRunAt && now - lastRunAt.getTime() < Math.min(runFrequencyMs, minIntervalMs)) return false;

	return true;
}
