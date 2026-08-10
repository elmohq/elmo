import { describe, expect, it } from "vitest";
import { shouldExpediteJob } from "./expedite";
import { isPromptOverdue } from "./overdue";
import { failureBackoffHours } from "./run-backoff";

/**
 * How much a prompt costs when its provider stops working.
 *
 * Every incident in this area has had the same shape: a target that fails
 * records nothing, the prompt therefore looks like it has never run, and some
 * part of the scheduler treats "never run" as "needs running now" — forever.
 * The individual guards against that read as obviously correct in isolation and
 * still compose into a loop, so what's asserted here is the composition: the
 * scheduler's two decisions driven over days of simulated time, counting how
 * many times a prompt actually reaches a provider.
 *
 * The counts are the point. Each cycle is RUNS_PER_PROMPT x targets paid calls,
 * so an attempt count is a bill.
 */

const HOUR = 60 * 60 * 1000;
const TICK_MS = 5 * 60 * 1000; // schedule-maintenance runs every 5 minutes
const EXPEDITE_MIN_INTERVAL_MS = HOUR;
const MODEL = "chatgpt";

interface PendingJob {
	createdAt: number;
	startAfter: number;
	consecutiveFailures: number;
}

/**
 * Runs the scheduler's decision path over simulated time for one prompt.
 *
 * Cycles complete instantly, which is the worst case for attempt rate: a real
 * cycle holds its job in `active`, where maintenance leaves it alone. `succeeds`
 * decides each cycle's outcome from the hour it starts at.
 */
function simulate({
	days,
	cadenceHours,
	succeeds,
}: {
	days: number;
	cadenceHours: number;
	succeeds: (elapsedHours: number) => boolean;
}): { attemptHours: number[]; perDay: number[] } {
	const runFrequencyMs = cadenceHours * HOUR;
	const promptCreatedAt = new Date(0);
	const attemptHours: number[] = [];

	let lastRunAt: number | null = null;
	let pending: PendingJob = { createdAt: 0, startAfter: 0, consecutiveFailures: 0 };

	for (let now = 0; now < days * 24 * HOUR; now += TICK_MS) {
		// 1. A due job runs, records its outcome, and schedules its successor.
		if (pending.startAfter <= now) {
			const elapsedHours = now / HOUR;
			attemptHours.push(elapsedHours);

			const ok = succeeds(elapsedHours);
			if (ok) lastRunAt = now;
			const consecutiveFailures = ok ? 0 : pending.consecutiveFailures + 1;
			const delayHours = failureBackoffHours(consecutiveFailures, cadenceHours);
			pending = { createdAt: now, startAfter: now + delayHours * HOUR, consecutiveFailures };
		}

		// 2. schedule-maintenance considers dragging the next job forward.
		const overdue = isPromptOverdue({
			models: [MODEL],
			lastRunByModel: lastRunAt === null ? {} : { [MODEL]: new Date(lastRunAt) },
			promptCreatedAt,
			runFrequencyMs,
			now,
		});
		if (
			overdue &&
			shouldExpediteJob({
				jobConsecutiveFailures: pending.consecutiveFailures,
				jobCreatedAt: new Date(pending.createdAt),
				lastRunAt: lastRunAt === null ? null : new Date(lastRunAt),
				runFrequencyMs,
				now,
				minIntervalMs: EXPEDITE_MIN_INTERVAL_MS,
			})
		) {
			pending = { ...pending, startAfter: now };
		}
	}

	const perDay = Array.from(
		{ length: days },
		(_, day) => attemptHours.filter((h) => h >= day * 24 && h < (day + 1) * 24).length,
	);
	return { attemptHours, perDay };
}

const ALWAYS = () => true;
const NEVER = () => false;

describe("what a prompt costs while its provider is broken", () => {
	// The incident: a provider that accepts and bills every request but whose
	// answers never come back, so no run is ever recorded.
	it("settles at the ordinary cadence instead of retrying all day", () => {
		const { perDay } = simulate({ days: 4, cadenceHours: 24, succeeds: NEVER });

		// The backoff ramp is allowed to spend its attempts on day one...
		expect(perDay[0]).toBeLessThanOrEqual(8);
		// ...and from then on a broken provider costs exactly what a working one does.
		expect(perDay.slice(1)).toEqual([1, 1, 1]);
	});

	it("costs no more than a working provider over a week", () => {
		const broken = simulate({ days: 7, cadenceHours: 24, succeeds: NEVER });
		const healthy = simulate({ days: 7, cadenceHours: 24, succeeds: ALWAYS });

		// Bounded by a small constant, not a multiple that grows with the outage.
		expect(broken.attemptHours.length - healthy.attemptHours.length).toBeLessThanOrEqual(6);
	});

	it("never re-fires on the maintenance tick", () => {
		const { attemptHours } = simulate({ days: 3, cadenceHours: 24, succeeds: NEVER });

		// The failure that started all this: attempts every 5 minutes, then every
		// hour once a partial guard was added. Both show up as gaps far below the
		// shortest backoff step.
		const gaps = attemptHours.slice(1).map((h, i) => h - attemptHours[i]);
		for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(0.25);
	});

	it("holds on a short cadence too, where the backoff never exceeds it", () => {
		const { perDay } = simulate({ days: 3, cadenceHours: 1, succeeds: NEVER });

		// 24 scheduled cycles a day, and a broken provider gets no extra.
		expect(perDay.slice(1).every((n) => n <= 24)).toBe(true);
	});
});

describe("what it costs when the provider is fine", () => {
	it("runs exactly on cadence and is never expedited", () => {
		const { perDay } = simulate({ days: 4, cadenceHours: 24, succeeds: ALWAYS });
		expect(perDay).toEqual([1, 1, 1, 1]);
	});

	it("returns to cadence after an outage ends without a catch-up burst", () => {
		const { perDay } = simulate({
			days: 4,
			cadenceHours: 24,
			succeeds: (h) => h >= 12, // broken for the first 12 hours
		});

		expect(perDay[0]).toBeLessThanOrEqual(8);
		expect(perDay.slice(1)).toEqual([1, 1, 1]);
	});

	it("does not let a flapping provider accumulate attempts", () => {
		const { perDay } = simulate({
			days: 5,
			cadenceHours: 24,
			succeeds: (h) => Math.floor(h / 24) % 2 === 0, // alternate days
		});

		for (const day of perDay) expect(day).toBeLessThanOrEqual(8);
	});
});

describe("expediting still does its job", () => {
	// The reason the expedite path exists: a job left behind by a crashed worker
	// is genuinely stalled and should be pulled forward. Guarding the backoff
	// must not cost us that.
	const now = new Date("2026-06-01T12:00:00Z").getTime();

	it("pulls forward a stalled job that carries no failure streak", () => {
		expect(
			shouldExpediteJob({
				jobConsecutiveFailures: 0,
				jobCreatedAt: new Date(now - 3 * HOUR),
				lastRunAt: new Date(now - 30 * HOUR),
				runFrequencyMs: 24 * HOUR,
				now,
				minIntervalMs: EXPEDITE_MIN_INTERVAL_MS,
			}),
		).toBe(true);
	});

	it("leaves the same job alone once it is a backoff", () => {
		expect(
			shouldExpediteJob({
				jobConsecutiveFailures: 1,
				jobCreatedAt: new Date(now - 3 * HOUR),
				lastRunAt: new Date(now - 30 * HOUR),
				runFrequencyMs: 24 * HOUR,
				now,
				minIntervalMs: EXPEDITE_MIN_INTERVAL_MS,
			}),
		).toBe(false);
	});
});
