export const JOB_SPAN_OP = "queue.process";
export const JOB_SAMPLE_RATE_ATTRIBUTE = "elmo.job.sample_rate";

/** Share of a queue's jobs that are traced. Errors are always reported. */
export const JOB_TRACE_RATE = {
	rare: 1,
	routine: 0.1,
	// Per-minute schedules would otherwise outnumber every other trace.
	cron: 0.01,
} as const;
