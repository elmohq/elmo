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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MentionAnalyzer, substringAnalyzer } from "../mention-judge/analyze";
import { deriveQueue } from "./__fixtures__/derive-queue";
import { DERIVE_PRIORITY, deriveRuns, requestUnjudgedRuns, sendDeriveRuns } from "./derive-runs";

let brandId: string;
let promptId: string;

/** Fails on any answer containing "unreadable", as a judge might on input it can't handle. */
const flakyAnalyzer: MentionAnalyzer = {
	...substringAnalyzer,
	analyze: async (text, config, previous) => {
		if (text?.includes("unreadable")) throw new Error("judge failed");
		return substringAnalyzer.analyze(text, config, previous);
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
	return currentAnalysisVersions(mentionConfigFrom(brand, []), null)[MENTIONS_KEY];
}

describe("deriving a recorded run", () => {
	it("gives it mentions under the brand's current config, and marks its rollups for a rebuild", async () => {
		const runId = await recordedRun("Acme is the easiest CRM to set up.");
		const queue = deriveQueue();
		await sendDeriveRuns(queue.boss, brandId, [runId], DERIVE_PRIORITY.new);
		expect(await queue.drain()).toEqual([]);
		expect(await mentionsOf(runId)).toMatchObject({ brandMentioned: true, stamp: await currentMentionsStamp() });
		expect(await db.select().from(rollupDirty).where(eq(rollupDirty.brandId, brandId))).not.toHaveLength(0);
	});

	it("leaves the run unjudged when the judge fails, for its job to retry; nothing falls back to matching names", async () => {
		const runId = await recordedRun("An unreadable answer about Acme.");
		await expect(deriveRuns({ brandId, runIds: [runId] }, db, deriveQueue().boss, flakyAnalyzer)).rejects.toThrow(
			"judge failed",
		);
		expect(await mentionsOf(runId)).toBeUndefined();
	});

	it("finishes the rest of a chunk and sends a run the judge fails on back on its own", async () => {
		const readable = await recordedRun("Acme is great.");
		const unreadable = await recordedRun("An unreadable answer about Acme.");
		const queue = deriveQueue(db, flakyAnalyzer);
		await sendDeriveRuns(queue.boss, brandId, [readable, unreadable], DERIVE_PRIORITY.history);

		expect(await queue.drain()).toEqual([{ brandId, runIds: [unreadable] }]);
		expect(await mentionsOf(readable)).toMatchObject({ brandMentioned: true });
		expect(await mentionsOf(unreadable)).toBeUndefined();
	});

	it("writes nothing when the brand's config moves while the chunk is judged", async () => {
		const runId = await recordedRun("Acme is great.");
		const renaming: MentionAnalyzer = {
			...substringAnalyzer,
			analyze: async (text, config, previous) => {
				await db.update(brands).set({ name: "Acme Corp" }).where(eq(brands.id, brandId));
				return substringAnalyzer.analyze(text, config, previous);
			},
		};
		await deriveRuns({ brandId, runIds: [runId] }, db, deriveQueue().boss, renaming);
		expect(await mentionsOf(runId)).toBeUndefined();
	});
});

describe("the unjudged-run sweep", () => {
	it("asks again for runs left unjudged, but not for ones just recorded or already judged", async () => {
		const stuck = await recordedRun("Acme again.", new Date(Date.now() - 60 * 60 * 1000));
		const fresh = await recordedRun("Acme, just now.");
		const judged = await recordedRun("Acme, judged.", new Date(Date.now() - 60 * 60 * 1000));
		await deriveRuns({ brandId, runIds: [judged] }, db, deriveQueue().boss, substringAnalyzer);

		const queue = deriveQueue();
		await requestUnjudgedRuns(db, queue.boss);
		const asked = queue.jobs.filter((job) => job.data.brandId === brandId).flatMap((job) => job.data.runIds);
		expect(asked).toContain(stuck);
		expect(asked).not.toContain(fresh);
		expect(asked).not.toContain(judged);
	});
});
