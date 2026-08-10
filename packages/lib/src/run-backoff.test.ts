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

	it("holds at the longest backoff instead of growing without bound", () => {
		const longest = FAILURE_BACKOFF_HOURS[FAILURE_BACKOFF_HOURS.length - 1];
		expect(failureBackoffHours(FAILURE_BACKOFF_HOURS.length + 50, 24)).toBe(longest);
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
