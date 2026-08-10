import { describe, expect, it } from "vitest";
import { FAILURE_BACKOFF_HOURS, failureBackoffHours } from "./run-backoff";

describe("failureBackoffHours", () => {
	it("puts a prompt back on its cadence once a cycle produces runs", () => {
		expect(failureBackoffHours(0, 24)).toBe(24);
		expect(failureBackoffHours(-1, 24)).toBe(24);
	});

	it("lengthens the wait with each consecutive failed cycle", () => {
		const delays = [1, 2, 3, 4, 5, 6].map((failures) => failureBackoffHours(failures, 24));
		expect(delays).toEqual(FAILURE_BACKOFF_HOURS);
		expect(delays).toEqual([...delays].sort((a, b) => a - b));
	});

	it("settles at the cadence once the ramp is exhausted", () => {
		// A permanently broken provider must not cost more than a working one.
		expect(failureBackoffHours(FAILURE_BACKOFF_HOURS.length + 1, 24)).toBe(24);
		expect(failureBackoffHours(FAILURE_BACKOFF_HOURS.length + 500, 24)).toBe(24);
	});

	it("ramps up to the cadence without ever exceeding it", () => {
		let previous = 0;
		for (let failures = 1; failures <= FAILURE_BACKOFF_HOURS.length + 2; failures++) {
			const delay = failureBackoffHours(failures, 24);
			expect(delay).toBeGreaterThanOrEqual(previous);
			expect(delay).toBeLessThanOrEqual(24);
			previous = delay;
		}
	});

	it("never retries more slowly than the prompt's own cadence", () => {
		// A brand on a one-hour cadence shouldn't be pushed out to eight.
		for (let failures = 1; failures <= 10; failures++) {
			expect(failureBackoffHours(failures, 1)).toBeLessThanOrEqual(1);
		}
	});

	it("never retries a failing prompt sooner than the shortest backoff", () => {
		for (let failures = 1; failures <= 10; failures++) {
			expect(failureBackoffHours(failures, 24)).toBeGreaterThanOrEqual(FAILURE_BACKOFF_HOURS[0]);
		}
	});
});
