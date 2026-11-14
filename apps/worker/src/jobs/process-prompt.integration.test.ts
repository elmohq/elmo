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
	`);
	return result.rows.map((row) => row.data);
}

/** Sends a job in the same singleton slot the follow-up will compute, then picks it up as a worker would. */
async function runningJob(slotSeconds: number): Promise<string> {
	const boss = getBoss();
	await boss.send(
		PROCESS_PROMPT_QUEUE,
		{ promptId, consecutiveFailures: 1 },
		{ singletonKey: promptSingletonKey(promptId), singletonSeconds: slotSeconds, ...PROMPT_JOB_OPTIONS },
	);
	const [job] = await boss.fetch(PROCESS_PROMPT_QUEUE);
	expect(job?.data).toMatchObject({ promptId });
	return job.id;
}

describe("scheduleNextRun", () => {
	it("queues the follow-up when the job that is running holds the singleton slot", async () => {
		await runningJob(2 * 60 * 60);

		await scheduleNextRun(promptId, 2, 2);

		expect(await queuedJobs()).toEqual([expect.objectContaining({ consecutiveFailures: 2 })]);
	});

	it("queues the follow-up when a finished job holds the singleton slot", async () => {
		const id = await runningJob(2 * 60 * 60);
		await getBoss().complete(PROCESS_PROMPT_QUEUE, id);

		await scheduleNextRun(promptId, 2, 3);

		expect(await queuedJobs()).toEqual([expect.objectContaining({ consecutiveFailures: 3 })]);
	});

	it("does not add a second job when one is already waiting to run", async () => {
		await scheduleNextRun(promptId, 2, 0);
		await scheduleNextRun(promptId, 2, 0);

		expect(await queuedJobs()).toHaveLength(1);
	});
});
