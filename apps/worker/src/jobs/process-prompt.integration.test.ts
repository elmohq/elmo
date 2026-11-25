import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { PROCESS_PROMPT_QUEUE, PROMPT_JOB_OPTIONS, promptSingletonKey } from "@workspace/lib/queues/prompt-jobs";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getBoss } from "../boss";
import { scheduleNextRun } from "./process-prompt";

let promptId: string;

beforeAll(async () => {
	const boss = getBoss();
	await boss.start();
	await boss.createQueue(PROCESS_PROMPT_QUEUE, PROMPT_JOB_OPTIONS);
});

afterAll(async () => {
	await getBoss().stop({ graceful: false });
});

beforeEach(() => {
	promptId = randomUUID();
});

afterEach(async () => {
	await db.execute(sql`DELETE FROM pgboss.job WHERE data->>'promptId' = ${promptId}`);
});

async function queuedJobs(): Promise<{ consecutiveFailures: number }[]> {
	const result = await db.execute<{ data: { consecutiveFailures: number } }>(sql`
		SELECT data FROM pgboss.job
		WHERE name = ${PROCESS_PROMPT_QUEUE} AND state = 'created' AND data->>'promptId' = ${promptId}
		ORDER BY start_after
	`);
	return result.rows.map((row) => row.data);
}

/** A job as schedule-maintenance starts one, already picked up by a worker. */
async function runningJob(): Promise<string> {
	const id = await getBoss().send(
		PROCESS_PROMPT_QUEUE,
		{ promptId, consecutiveFailures: 1 },
		{ singletonKey: promptSingletonKey(promptId), singletonSeconds: 2 * 60 * 60, ...PROMPT_JOB_OPTIONS },
	);
	if (!id) throw new Error("pg-boss did not queue the job");
	await db.execute(sql`UPDATE pgboss.job SET state = 'active', started_on = now() WHERE id = ${id}::uuid`);
	return id;
}

describe("scheduleNextRun", () => {
	it("queues the follow-up while the prompt's job is still running", async () => {
		await runningJob();

		await scheduleNextRun(promptId, 2, 2);

		expect(await queuedJobs()).toEqual([expect.objectContaining({ consecutiveFailures: 2 })]);
	});

	it("queues the follow-up after an earlier job for the prompt has finished", async () => {
		const id = await runningJob();
		await getBoss().complete(PROCESS_PROMPT_QUEUE, id);

		await scheduleNextRun(promptId, 2, 3);

		expect(await queuedJobs()).toEqual([expect.objectContaining({ consecutiveFailures: 3 })]);
	});

	it("does not add a second job when one is already waiting to run", async () => {
		await scheduleNextRun(promptId, 2, 0);
		await scheduleNextRun(promptId, 2, 0);

		expect(await queuedJobs()).toHaveLength(1);
	});

	it("queues one follow-up when two cycles of a prompt finish at once", async () => {
		// Connections opened on demand would stagger the calls and hide a race between them.
		await Promise.all(Array.from({ length: 5 }, () => db.execute(sql`SELECT pg_sleep(0.05)`)));

		await Promise.all(Array.from({ length: 5 }, () => scheduleNextRun(promptId, 24, 0)));

		expect(await queuedJobs()).toHaveLength(1);
	});

	it("keeps a backoff retry that is due before the job already waiting", async () => {
		await scheduleNextRun(promptId, 24, 0);
		await scheduleNextRun(promptId, 0.25, 1);

		expect(await queuedJobs()).toEqual([
			expect.objectContaining({ consecutiveFailures: 1 }),
			expect.objectContaining({ consecutiveFailures: 0 }),
		]);
	});

	it("does not queue behind a manual retry that is waiting to run", async () => {
		await getBoss().send(
			PROCESS_PROMPT_QUEUE,
			{ promptId },
			{ singletonKey: promptSingletonKey(promptId), ...PROMPT_JOB_OPTIONS },
		);

		await scheduleNextRun(promptId, 24, 0);

		expect(await queuedJobs()).toHaveLength(1);
	});
});
