import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetProviderLimiters, withProviderSlot } from "./limiter";

/**
 * The gate exists to stop overspending, but the behaviour that actually matters
 * is the one underneath it: every scheduled run still happens, exactly once, and
 * the whole day's work still fits in a day. A limiter that achieves thrift by
 * dropping runs would pass every test in limiter.test.ts and be useless.
 *
 * These cases model a full cycle for a typical brand — 25 prompts x 6 tracked
 * platforms x RUNS_PER_PROMPT samples = 750 provider calls — against a simulated
 * provider, and assert throughput rather than restraint.
 */
const PROMPTS = 25;
const TARGETS = 6;
const RUNS = 5;
const TOTAL_CALLS = PROMPTS * TARGETS * RUNS;

const GATE = 6;
const DAY_SECONDS = 24 * 60 * 60;

/** One provider call: occupies a slot for `durationMs`, then returns an answer. */
function simulatedCall(durationMs: number, onStart: () => void, onEnd: () => void) {
	return async () => {
		onStart();
		await new Promise((resolve) => setTimeout(resolve, durationMs));
		onEnd();
		return "answer";
	};
}

async function runFullCycle(taskSeconds: number) {
	let inFlight = 0;
	let peakInFlight = 0;
	let started = 0;

	const calls = Array.from({ length: TOTAL_CALLS }, () =>
		withProviderSlot(
			"cloro",
			simulatedCall(
				taskSeconds * 1000,
				() => {
					started++;
					inFlight++;
					peakInFlight = Math.max(peakInFlight, inFlight);
				},
				() => {
					inFlight--;
				},
			),
		),
	);

	const startedAt = Date.now();
	const settled = Promise.allSettled(calls);
	await vi.runAllTimersAsync();
	const results = await settled;

	return {
		started,
		peakInFlight,
		elapsedSeconds: (Date.now() - startedAt) / 1000,
		answers: results.filter((r) => r.status === "fulfilled").length,
		failures: results.filter((r) => r.status === "rejected").length,
	};
}

beforeEach(() => {
	resetProviderLimiters();
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	vi.stubEnv("PROVIDER_MAX_CONCURRENCY", String(GATE));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	resetProviderLimiters();
});

describe("a full cycle under the gate", () => {
	// 120s is the mid-range for these surfaces; the two cases either side bound it.
	it("runs every scheduled call exactly once and finishes inside the cadence", async () => {
		const result = await runFullCycle(120);

		expect(result.answers).toBe(TOTAL_CALLS);
		expect(result.failures).toBe(0);
		// Exactly once — the gate delays calls, it must never drop or duplicate one.
		expect(result.started).toBe(TOTAL_CALLS);
		expect(result.peakInFlight).toBe(GATE);
		expect(result.elapsedSeconds).toBeLessThan(DAY_SECONDS);
	});

	it("still fits the day when every call runs at the slowest healthy speed", async () => {
		// 600s is where the Cloro provider gives up on a task, so it's the slowest
		// a call can be and still return an answer at all.
		const result = await runFullCycle(600);

		expect(result.answers).toBe(TOTAL_CALLS);
		expect(result.elapsedSeconds).toBeLessThan(DAY_SECONDS);
	});

	it("keeps the gate saturated rather than idling between waves", async () => {
		const taskSeconds = 120;
		const result = await runFullCycle(taskSeconds);

		// Perfect packing is TOTAL_CALLS / GATE waves; allow one wave of slack.
		const idealSeconds = (TOTAL_CALLS / GATE) * taskSeconds;
		expect(result.elapsedSeconds).toBeLessThanOrEqual(idealSeconds + taskSeconds);
	});
});
