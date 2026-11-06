import { describe, expect, it } from "vitest";
import { pollTask, type TaskState } from "./poll-task";

function fakeClock() {
	let t = 0;
	return {
		now: () => t,
		sleep: async (ms: number) => {
			t += ms;
		},
		advance: (ms: number) => {
			t += ms;
		},
	};
}

const MINUTE = 60 * 1000;

async function rejection(promise: Promise<unknown>): Promise<Error> {
	return promise.then(
		() => {
			throw new Error("expected the wait to reject");
		},
		(error: Error) => error,
	);
}

function classifier(map: Record<string, TaskState>) {
	return (status: string) => map[status] ?? "running";
}

const STANDARD = classifier({ done: "ready", broken: "failed", waiting: "queued", working: "running" });

function statusSequence(statuses: (string | null)[]) {
	let i = 0;
	return async () => statuses[Math.min(i++, statuses.length - 1)];
}

describe("waiting for a vendor's task to settle", () => {
	it("returns the status the task settled on", async () => {
		const clock = fakeClock();

		const settled = await pollTask({
			describe: "task t",
			poll: statusSequence(["working", "done"]),
			classify: STANDARD,
			totalTimeoutMs: 10 * MINUTE,
			...clock,
		});

		expect(settled).toBe("done");
	});

	it("uses the status the submit response already carried", async () => {
		const clock = fakeClock();
		let polled = 0;

		await pollTask({
			describe: "task t",
			initial: "done",
			poll: async () => {
				polled++;
				return "done";
			},
			classify: STANDARD,
			totalTimeoutMs: 10 * MINUTE,
			...clock,
		});

		expect(polled).toBe(0);
	});

	it("reads an answer that arrives on the very last poll", async () => {
		const clock = fakeClock();

		const settled = await pollTask({
			describe: "task t",
			poll: statusSequence(["working", "done"]),
			classify: STANDARD,
			totalTimeoutMs: 2001,
			...clock,
		});

		expect(settled).toBe("done");
	});

	it("fails on a terminal failure, in the vendor's own words", async () => {
		const clock = fakeClock();

		await expect(
			pollTask({
				describe: "Oxylabs job j1",
				poll: statusSequence(["broken"]),
				classify: STANDARD,
				failureVerb: "faulted",
				describeFailure: (status) => ` (${status})`,
				totalTimeoutMs: 10 * MINUTE,
				...clock,
			}),
		).rejects.toThrow("Oxylabs job j1 faulted (broken)");
	});

	it("keeps waiting through a status it has never seen before", async () => {
		const clock = fakeClock();

		const settled = await pollTask({
			describe: "task t",
			poll: statusSequence(["reticulating-splines", "done"]),
			classify: STANDARD,
			totalTimeoutMs: 10 * MINUTE,
			...clock,
		});

		expect(settled).toBe("done");
	});

	it("keeps the last known status when a status read tells it nothing", async () => {
		const clock = fakeClock();

		const settled = await pollTask({
			describe: "task t",
			poll: statusSequence(["working", null, null, "done"]),
			classify: STANDARD,
			totalTimeoutMs: 10 * MINUTE,
			...clock,
		});

		expect(settled).toBe("done");
	});

	it("gives up at the ceiling, saying where the task stopped", async () => {
		const clock = fakeClock();

		const error = await rejection(
			pollTask({
				describe: "Cloro task c1",
				poll: statusSequence(["working"]),
				classify: STANDARD,
				describeStatus: (status) => status ?? "unknown",
				totalTimeoutMs: 5 * MINUTE,
				...clock,
			}),
		);

		expect(error.message).toMatch(/Cloro task c1 timed out after 300s in status working/);
		expect(error.message).toMatch(/billed if it does/);
	});

	it("holds a started task to its own budget, not the queue's ceiling", async () => {
		const clock = fakeClock();

		const error = await rejection(
			pollTask({
				describe: "task t",
				poll: statusSequence(["working"]),
				classify: STANDARD,
				totalTimeoutMs: 60 * MINUTE,
				runningTimeoutMs: 10 * MINUTE,
				...clock,
			}),
		);

		expect(error.message).toMatch(/timed out after 60\ds/);
	});

	it("doesn't spend the running budget while the task is still queued", async () => {
		const clock = fakeClock();

		const error = await rejection(
			pollTask({
				describe: "task t",
				poll: statusSequence(["waiting"]),
				classify: STANDARD,
				totalTimeoutMs: 60 * MINUTE,
				runningTimeoutMs: 10 * MINUTE,
				...clock,
			}),
		);

		expect(Number(error.message.match(/timed out after (\d+)s/)?.[1])).toBeGreaterThanOrEqual(60 * 60);
	});

	it("starts the running budget the moment the task leaves the queue", async () => {
		const clock = fakeClock();

		const error = await rejection(
			pollTask({
				describe: "task t",
				poll: statusSequence(["waiting", "waiting", "working"]),
				classify: STANDARD,
				totalTimeoutMs: 60 * MINUTE,
				runningTimeoutMs: 10 * MINUTE,
				...clock,
			}),
		);

		const seconds = Number(error.message.match(/timed out after (\d+)s/)?.[1]);
		expect(seconds).toBeGreaterThan(10 * 60);
		expect(seconds).toBeLessThan(20 * 60);
	});

	it("never waits past the ceiling, however long the running budget is", async () => {
		const clock = fakeClock();

		const error = await rejection(
			pollTask({
				describe: "task t",
				poll: statusSequence(["working"]),
				classify: STANDARD,
				totalTimeoutMs: 2 * MINUTE,
				runningTimeoutMs: 60 * MINUTE,
				...clock,
			}),
		);

		expect(Number(error.message.match(/timed out after (\d+)s/)?.[1])).toBeLessThanOrEqual(2 * 60);
	});
});
