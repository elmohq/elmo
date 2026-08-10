import { describe, expect, it } from "vitest";
import { shouldExpediteJob } from "./expedite";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const MIN_INTERVAL = HOUR;
const CADENCE = 24 * HOUR;

function ago(ms: number): Date {
	return new Date(NOW - ms);
}

function check(overrides: Partial<Parameters<typeof shouldExpediteJob>[0]> = {}) {
	return shouldExpediteJob({
		jobCreatedAt: ago(2 * HOUR),
		lastRunAt: null,
		runFrequencyMs: CADENCE,
		now: NOW,
		minIntervalMs: MIN_INTERVAL,
		...overrides,
	});
}

describe("shouldExpediteJob", () => {
	it("expedites a job left behind long enough to look stalled", () => {
		expect(check({ jobCreatedAt: ago(3 * HOUR) })).toBe(true);
	});

	// The case that made one broken provider expensive: a cycle whose runs all
	// failed records nothing, so the prompt looks like it has never run and stays
	// overdue forever. Its backoff job must survive the next maintenance pass.
	it("leaves a freshly scheduled job alone even when nothing has ever been recorded", () => {
		expect(check({ jobCreatedAt: ago(15 * 60 * 1000), lastRunAt: null })).toBe(false);
	});

	it("still expedites a never-recorded prompt once its job is genuinely old", () => {
		expect(check({ jobCreatedAt: ago(2 * HOUR), lastRunAt: null })).toBe(true);
	});

	it("leaves a prompt alone while its last recorded run is recent", () => {
		expect(check({ jobCreatedAt: ago(2 * HOUR), lastRunAt: ago(10 * 60 * 1000) })).toBe(false);
	});

	it("expedites once both the schedule and the last run are stale", () => {
		expect(check({ jobCreatedAt: ago(2 * HOUR), lastRunAt: ago(30 * HOUR) })).toBe(true);
	});

	it("uses the cadence as the run window when it is shorter than the floor", () => {
		const runFrequencyMs = 10 * 60 * 1000;
		expect(check({ runFrequencyMs, lastRunAt: ago(5 * 60 * 1000) })).toBe(false);
		expect(check({ runFrequencyMs, lastRunAt: ago(20 * 60 * 1000) })).toBe(true);
	});

	it("never expedites the same prompt more than once per interval", () => {
		// A job expedited on the previous pass was created before that pass, so
		// only its age matters — and anything younger than the floor is refused.
		for (const minutes of [0, 5, 30, 59]) {
			expect(check({ jobCreatedAt: ago(minutes * 60 * 1000) })).toBe(false);
		}
	});
});
