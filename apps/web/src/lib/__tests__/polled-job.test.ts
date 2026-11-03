import { describe, expect, it } from "vitest";
import {
	idlePolledJob,
	isPolledJobRunning,
	type PolledJobEvent,
	type PolledJobState,
	polledJobReducer,
} from "@/lib/polled-job";

interface Suggestions {
	status: "done";
	prompts: string[];
}

const DONE: Suggestions = { status: "done", prompts: ["how do i track brand mentions"] };

function apply(events: PolledJobEvent<Suggestions>[]): PolledJobState<Suggestions> {
	return events.reduce(polledJobReducer<Suggestions>, idlePolledJob<Suggestions>());
}

const STARTED: PolledJobEvent<Suggestions>[] = [
	{ type: "run", run: 1 },
	{ type: "started", run: 1 },
];

describe("waiting on a job the browser started", () => {
	it("polls only once the job is known to be queued", () => {
		expect(apply([{ type: "run", run: 1 }]).status).toBe("starting");
		expect(apply(STARTED).status).toBe("polling");
	});

	it("keeps waiting while the server says pending", () => {
		const state = apply([...STARTED, { type: "polled", run: 1, status: { status: "pending" } }]);

		expect(state.status).toBe("polling");
	});

	it("finishes with the job's result", () => {
		const state = apply([...STARTED, { type: "polled", run: 1, status: DONE }]);

		expect(state).toEqual({ status: "settled", run: 1, outcome: { kind: "done", done: DONE } });
	});

	it("finishes with the server's error", () => {
		const state = apply([...STARTED, { type: "polled", run: 1, status: { status: "failed", error: "no" } }]);

		expect(state).toMatchObject({ outcome: { kind: "failed", error: "no" } });
	});

	it("finishes when the job could not be queued at all", () => {
		const state = apply([
			{ type: "run", run: 1 },
			{ type: "start-failed", run: 1, error: "offline" },
		]);

		expect(state).toMatchObject({ outcome: { kind: "failed", error: "offline" } });
	});
});

describe("a run that has been superseded", () => {
	it("ignores the old run's enqueue landing after a new run started", () => {
		const state = apply([
			{ type: "run", run: 1 },
			{ type: "run", run: 2 },
			{ type: "started", run: 1 },
		]);

		expect(state).toEqual({ status: "starting", run: 2 });
	});

	it("ignores the old run's result arriving after a new run started", () => {
		const state = apply([...STARTED, { type: "run", run: 2 }, { type: "polled", run: 1, status: DONE }]);

		expect(isPolledJobRunning(state)).toBe(true);
	});

	it("ignores the old run's failure, so a retry isn't reported as broken", () => {
		const state = apply([
			...STARTED,
			{ type: "run", run: 2 },
			{ type: "polled", run: 1, status: { status: "failed", error: "stale" } },
		]);

		expect(state.status).not.toBe("settled");
	});

	it("starts a new run from any state, including a settled one", () => {
		const settled = apply([...STARTED, { type: "polled", run: 1, status: DONE }]);

		expect(polledJobReducer(settled, { type: "run", run: 2 })).toEqual({ status: "starting", run: 2 });
	});
});

describe("leaving the wait early", () => {
	it("cancels a run that is still being queued", () => {
		const state = apply([{ type: "run", run: 1 }, { type: "cancel" }]);

		expect(state).toMatchObject({ outcome: { kind: "cancelled" } });
	});

	it("cancels a run that is being polled", () => {
		const state = apply([...STARTED, { type: "cancel" }]);

		expect(state).toMatchObject({ outcome: { kind: "cancelled" } });
	});

	it("times out a run that never settles", () => {
		const state = apply([...STARTED, { type: "timeout" }]);

		expect(state).toMatchObject({ outcome: { kind: "timed-out" } });
	});

	it("does nothing when a stale timer fires after the job already finished", () => {
		const done = apply([...STARTED, { type: "polled", run: 1, status: DONE }]);

		expect(polledJobReducer(done, { type: "timeout" })).toBe(done);
		expect(polledJobReducer(done, { type: "cancel" })).toBe(done);
	});

	it("does nothing when nothing is running", () => {
		const idle = idlePolledJob<Suggestions>();

		expect(polledJobReducer(idle, { type: "cancel" })).toBe(idle);
		expect(polledJobReducer(idle, { type: "timeout" })).toBe(idle);
	});

	it("doesn't settle a cancelled run when its result arrives anyway", () => {
		const cancelled = apply([...STARTED, { type: "cancel" }]);

		expect(polledJobReducer(cancelled, { type: "polled", run: 1, status: DONE })).toBe(cancelled);
	});
});
