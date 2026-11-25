export const GENERATE_REPORT_QUEUE = "generate-report";

export const REPORT_JOB_OPTIONS = {
	// A retry would pay for the whole candidate fan-out again.
	retryLimit: 0,
	// pg-boss can't cancel in-flight work, so a shorter expiry hides spend rather than stopping it.
	expireInSeconds: 2 * 60 * 60,
} as const;
