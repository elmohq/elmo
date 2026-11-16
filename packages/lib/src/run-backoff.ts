/**
 * A failed cycle has already paid the providers, so failures back off far more
 * coldly than a queue retry, never past the prompt's normal cadence.
 */
export const FAILURE_BACKOFF_HOURS = [0.25, 0.5, 1, 2, 4, 8];

/**
 * `consecutiveFailures` includes the cycle just finished. Past the ramp the wait
 * is the cadence, so an outage costs no more than normal operation.
 */
export function failureBackoffHours(consecutiveFailures: number, cadenceHours: number): number {
	if (consecutiveFailures <= 0) return cadenceHours;
	if (consecutiveFailures > FAILURE_BACKOFF_HOURS.length) return cadenceHours;
	return Math.min(FAILURE_BACKOFF_HOURS[consecutiveFailures - 1], cadenceHours);
}
