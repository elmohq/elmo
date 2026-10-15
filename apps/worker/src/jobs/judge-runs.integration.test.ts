import { randomUUID } from "node:crypto";
import { currentAnalysisVersions, EXTRACTION_STAMP, MENTIONS_KEY } from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	organization,
	promptRuns,
	prompts,
	rollupDirty,
	runExtractions,
	runMentions,
} from "@workspace/lib/db/schema";
import { mentionConfigFrom } from "@workspace/lib/mentions";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cuedAnalyzer } from "../mention-judge/__fixtures__/cued-judge";
import type { MentionAnalyzer } from "../mention-judge/analyze";
import { JUDGE_RUNS_QUEUE, judgeRun, requestUnjudgedRuns } from "./judge-runs";
import { REPROCESS_QUEUE, runReprocess } from "./reprocess";

let brandId: string;
let promptId: string;

/** Fails on any answer containing "unreadable", as a judge might on input it can't handle. */
const flakyAnalyzer: MentionAnalyzer = {
	...cuedAnalyzer,
	analyze: async (text, config, previous) => {
		if (text?.includes("unreadable")) throw new Error("judge failed");
		return cuedAnalyzer.analyze(text, config, previous);
	},
};

beforeEach(async () => {
	brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: brandId, organizationId: brandId, name: "Acme", website: "https://acme.example", onboarded: true });
	[{ id: promptId }] = await db.insert(prompts).values({ brandId, value: "best crm" }).returning({ id: prompts.id });
});

afterEach(async () => {
	await db.delete(rollupDirty).where(eq(rollupDirty.brandId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
});

/** A run as the provider job records it: its answer and extraction, no mentions yet. */
async function recordedRun(text: string, createdAt = new Date()): Promise<string> {
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId,
		brandId,
		model: "gpt-5",
		provider: "openai-api",
		version: "test",
		webSearchEnabled: true,
		rawOutput: { output: [{ type: "message", content: [{ type: "output_text", text }] }] },
		createdAt,
	});
	await db.insert(runExtractions).values({ runId: id, textContent: text, stamp: EXTRACTION_STAMP });
	return id;
}

const mentionsOf = async (runId: string) =>
	(await db.select().from(runMentions).where(eq(runMentions.runId, runId)))[0];

async function currentMentionsStamp() {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	return currentAnalysisVersions(mentionConfigFrom(brand, []), cuedAnalyzer.judgeVersion)[MENTIONS_KEY];
}

describe("judging a recorded run", () => {
	it("gives it mentions under the brand's current config, and marks its rollups for a rebuild", async () => {
		const runId = await recordedRun("Acme is the easiest CRM to set up.");
		await judgeRun(runId, db, cuedAnalyzer);
		expect(await mentionsOf(runId)).toMatchObject({ brandMentioned: true, stamp: await currentMentionsStamp() });
		expect(await db.select().from(rollupDirty).where(eq(rollupDirty.brandId, brandId))).not.toHaveLength(0);
	});

	it("leaves the run unjudged when the judge fails, for its job to retry; nothing falls back to matching names", async () => {
		const runId = await recordedRun("An unreadable answer about Acme.");
		await expect(judgeRun(runId, db, flakyAnalyzer)).rejects.toThrow("judge failed");
		expect(await mentionsOf(runId)).toBeUndefined();
	});
});

describe("the unjudged-run sweep", () => {
	it("asks again for runs left unjudged, but not for ones just recorded or already judged", async () => {
		const stuck = await recordedRun("Acme again.", new Date(Date.now() - 60 * 60 * 1000));
		await recordedRun("Acme, just now.");
		const judged = await recordedRun("Acme, judged.", new Date(Date.now() - 60 * 60 * 1000));
		await judgeRun(judged, db, cuedAnalyzer);

		const insert = vi.fn();
		await requestUnjudgedRuns(db, { insert });
		const asked = insert.mock.calls.flatMap(([, jobs]) =>
			jobs.map((job: { data: { runId: string } }) => job.data.runId),
		);
		expect(asked).toContain(stuck);
		expect(asked).not.toContain(judged);
	});
});

describe("a replay the judge fails on", () => {
	it("hands the run to the judging queue and finishes the rest, without asking for another pass", async () => {
		const readable = await recordedRun("Acme is great.");
		const unreadable = await recordedRun("An unreadable answer about Acme.");
		await db.insert(runMentions).values([
			{ runId: readable, brandMentioned: false, stamp: "old" },
			{ runId: unreadable, brandMentioned: false, stamp: "old" },
		]);
		const boss = { send: vi.fn().mockResolvedValue("job-id"), insert: vi.fn() };

		await runReprocess({ brandId, layers: ["interpretation"] }, db, boss, flakyAnalyzer);

		expect(await mentionsOf(readable)).toMatchObject({ brandMentioned: true, stamp: await currentMentionsStamp() });
		expect(await mentionsOf(unreadable)).toMatchObject({ brandMentioned: false, stamp: "old" });
		expect(boss.insert).toHaveBeenCalledWith(JUDGE_RUNS_QUEUE, [
			{ data: { runId: unreadable }, singletonKey: unreadable },
		]);
		expect(boss.send.mock.calls.filter(([queue]) => queue === REPROCESS_QUEUE)).toEqual([]);
	});
});
