export const GENERATE_REPORT_QUEUE = "generate-report";

/**
 * Queue options for a report job, wherever it's scheduled from.
 *
 * `retryLimit: 0` because by the time this job can fail it has already bought
 * the candidate fan-out — every candidate prompt against every scrape target,
 * which is essentially the whole cost of a report. A queue-level retry buys it
 * again, and the previous attempt's answers are not reused. A failed report is
 * requested again by a person, who knows they are asking to pay for it.
 *
 * The expiry has to outlast the fan-out for the same reason it does on
 * process-prompt: pg-boss cannot cancel the promises a job has in flight, so an
 * expiry shorter than the work doesn't stop the spend, it only hides it.
 */
export const REPORT_JOB_OPTIONS = {
	retryLimit: 0,
	expireInSeconds: 2 * 60 * 60,
} as const;
