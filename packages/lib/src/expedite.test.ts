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
		jobConsecutiveFailures: 0,
		lastRunAt: null,
		runFrequencyMs: CADENCE,
		now: NOW,
		minIntervalMs: MIN_INTERVAL,
		...overrides,
	});
}

describe("shouldExpediteJob", () => {
	it("expedites a job left behind by a prompt that looks stalled", () => {
		expect(check()).toBe(true);
	});

	// The case that made one broken provider expensive: a cycle whose runs all
	// failed records nothing, so the prompt looks like it has never run and stays
	// overdue forever. Its backoff job must survive the next maintenance pass —
	// and that cycle set a streak, which is what says so.
	it("leaves a backoff job alone even when nothing has ever been recorded", () => {
		expect(check({ jobConsecutiveFailures: 1, lastRunAt: null })).toBe(false);
	});

	it("expedites a never-recorded prompt that carries no streak", () => {
		expect(check({ jobConsecutiveFailures: 0, lastRunAt: null })).toBe(true);
	});

	it("leaves a prompt alone while its last recorded run is recent", () => {
		expect(check({ lastRunAt: ago(10 * 60 * 1000) })).toBe(false);
	});

	it("expedites once the last run is stale", () => {
		expect(check({ lastRunAt: ago(30 * HOUR) })).toBe(true);
	});

	it("uses the cadence as the run window when it is shorter than the floor", () => {
		const runFrequencyMs = 10 * 60 * 1000;
		expect(check({ runFrequencyMs, lastRunAt: ago(5 * 60 * 1000) })).toBe(false);
		expect(check({ runFrequencyMs, lastRunAt: ago(20 * 60 * 1000) })).toBe(true);
	});

	it("refuses the next pass whatever the expedited cycle did", () => {
		// What stops the same prompt being moved forward on every pass is the
		// outcome of the cycle it just ran, not any property of the job: a cycle
		// that produced a run is caught by the run window, and one whose runs all
		// failed carries a streak. Those two are the only outcomes.
		expect(check({ lastRunAt: ago(60 * 1000) })).toBe(false);
		expect(check({ jobConsecutiveFailures: 1 })).toBe(false);
	});
});
