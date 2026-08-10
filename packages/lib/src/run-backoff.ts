/**
 * How long to wait before running a prompt again after a cycle in which every
 * run failed.
 *
 * A cycle that fails has already paid the providers for the attempt — most bill
 * on submission or on completion, not on whether the caller could use the
 * answer — so the schedule after a failure has to be much colder than the
 * queue's usual "retry three times, a minute apart". Delays grow with the run of
 * consecutive failed cycles and never exceed the prompt's normal cadence, so a
 * lasting outage settles back into the ordinary schedule instead of running hot
 * against a provider that is down, out of credit, or rate limiting.
 */
export const FAILURE_BACKOFF_HOURS = [0.25, 0.5, 1, 2, 4, 8];

/**
 * Hours to wait before the next attempt.
 *
 * `consecutiveFailures` counts cycles where every run failed, including the one
 * just finished, so the first failure gets FAILURE_BACKOFF_HOURS[0]. A value of
 * 0 (or less) means the last cycle produced something and the prompt goes back
 * on its cadence.
 *
 * Once the ramp is exhausted the wait settles at the cadence rather than at the
 * last step, so a provider that stays broken costs exactly what a provider that
 * stays healthy costs. Anything shorter would mean an outage is billed at a
 * higher rate than normal operation, which is the wrong way round.
 */
export function failureBackoffHours(consecutiveFailures: number, cadenceHours: number): number {
	if (consecutiveFailures <= 0) return cadenceHours;
	if (consecutiveFailures > FAILURE_BACKOFF_HOURS.length) return cadenceHours;
	return Math.min(FAILURE_BACKOFF_HOURS[consecutiveFailures - 1], cadenceHours);
}
