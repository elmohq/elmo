import { randomUUID } from "node:crypto";
import { currentAnalysisVersions, EXTRACTION_KEY, MENTIONS_KEY } from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	citations,
	competitors,
	organization,
	promptRuns,
	prompts,
	runExtractions,
	runMentions,
} from "@workspace/lib/db/schema";
import { mentionConfigFrom } from "@workspace/lib/mentions";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveQueue } from "./__fixtures__/derive-queue";
import { fillLegacyText, LEGACY_EXTRACTION_STAMP } from "./fill-legacy-text";
import {
	adoptCurrentStamps,
	REPROCESS_QUEUE,
	type ReprocessData,
	requestStaleReprocesses,
	runReprocess,
} from "./reprocess";

const openAiPayload = (text: string, url = "https://example.com/a") => ({
	output: [
		{
			type: "message",
			content: [{ type: "output_text", text, annotations: [{ type: "url_citation", url, title: "A" }] }],
		},
	],
});

function fakeBoss() {
	const send = vi.fn().mockResolvedValue("job-id");
	return { send, boss: { send } };
}

const sentFor = (send: ReturnType<typeof vi.fn>, brandId: string): ReprocessData[] =>
	send.mock.calls
		.filter(([queue, data]) => queue === REPROCESS_QUEUE && data.brandId === brandId)
		.map(([, data]) => data);

let brandId: string;
let promptId: string;

async function createBrand(analysisVersions: Record<string, string> | null = {}): Promise<string> {
	const id = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
	await db.insert(brands).values({
		id,
		organizationId: id,
		name: "Acme",
		website: "https://acme.example",
		onboarded: true,
		analysisVersions,
	});
	return id;
}

async function deleteBrand(id: string): Promise<void> {
	await db.delete(citations).where(eq(citations.brandId, id));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, id));
	await db.delete(prompts).where(eq(prompts.brandId, id));
	await db.delete(competitors).where(eq(competitors.brandId, id));
	await db.delete(brands).where(eq(brands.id, id));
	await db.delete(organization).where(eq(organization.id, id));
}

/** A run as stored before replayable runs: no text, no stamps. */
function legacyRun(text: string, createdAt: Date | ReturnType<typeof sql>) {
	return {
		id: randomUUID(),
		promptId,
		brandId,
		model: "gpt-5",
		provider: "openai-api",
		version: "test",
		webSearchEnabled: true,
		rawOutput: openAiPayload(text),
		createdAt,
	};
}

/** Inserts runs with the unstamped derived rows a migrated legacy run has. */
async function insertLegacyRuns(runs: ReturnType<typeof legacyRun>[]): Promise<void> {
	await db.insert(promptRuns).values(runs);
	await db.insert(runExtractions).values(runs.map((run) => ({ runId: run.id })));
	await db.insert(runMentions).values(runs.map((run) => ({ runId: run.id, brandMentioned: false })));
}

async function currentVersions(id: string) {
	const [brand] = await db.select().from(brands).where(eq(brands.id, id));
	const brandCompetitors = await db.select().from(competitors).where(eq(competitors.brandId, id));
	return currentAnalysisVersions(mentionConfigFrom(brand, brandCompetitors), null);
}

async function runsInWalkOrder() {
	return db
		.select({
			id: promptRuns.id,
			textContent: runExtractions.textContent,
			extractionStamp: runExtractions.stamp,
			brandMentioned: runMentions.brandMentioned,
			competitorsMentioned: runMentions.competitorsMentioned,
			mentionsStamp: runMentions.stamp,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(eq(promptRuns.brandId, brandId))
		.orderBy(asc(promptRuns.createdAt), asc(promptRuns.id));
}

beforeEach(async () => {
	brandId = await createBrand();
	const [prompt] = await db.insert(prompts).values({ brandId, value: "best crm" }).returning({ id: prompts.id });
	promptId = prompt.id;
});

afterEach(async () => {
	await deleteBrand(brandId);
});

afterAll(async () => {
	await db.$client.end();
});

/** A whole pass: the replay queues the brand's stale runs, and the derivation workers take them. */
async function replay(data: ReprocessData) {
	const queue = deriveQueue();
	await runReprocess(data, db, queue.boss);
	const queued = [...queue.jobs];
	expect(await queue.drain()).toEqual([]);
	return queued;
}

const BOTH_LAYERS: ReprocessData["layers"] = ["extraction", "interpretation"];

describe("runReprocess", () => {
	it("extracts a stored run's text and citations, derives its mentions, and stamps the brand", async () => {
		await insertLegacyRuns([legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"))]);

		await replay({ brandId, layers: BOTH_LAYERS });

		const [run] = await runsInWalkOrder();
		expect(run.textContent).toBe("Acme is the best CRM.");
		const current = await currentVersions(brandId);
		expect([run.extractionStamp, run.mentionsStamp]).toEqual([current[EXTRACTION_KEY], current[MENTIONS_KEY]]);
		expect(run.brandMentioned).toBe(true);
		const cited = await db.select().from(citations).where(eq(citations.promptRunId, run.id));
		expect(cited.map((citation) => citation.url)).toEqual(["https://example.com/a"]);

		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
		expect(brand.analysisVersions).toEqual(current);
	});

	it("leaves runs that are already current untouched", async () => {
		const run = legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"));
		await insertLegacyRuns([run]);
		await replay({ brandId, layers: BOTH_LAYERS });
		await db.update(runMentions).set({ brandMentioned: false }).where(eq(runMentions.runId, run.id));

		expect(await replay({ brandId, layers: BOTH_LAYERS })).toEqual([]);

		expect((await runsInWalkOrder())[0].brandMentioned).toBe(false);
	});

	it("derives a history spread over many chunks, even where creation times tie", async () => {
		const sharedInstant = sql`'2026-02-01 10:00:00.123456+00'::timestamptz`;
		await insertLegacyRuns(Array.from({ length: 450 }, () => legacyRun("Acme is the best CRM.", sharedInstant)));

		await replay({ brandId, layers: BOTH_LAYERS });

		const runs = await runsInWalkOrder();
		expect(runs).toHaveLength(450);
		const extracted = (await currentVersions(brandId))[EXTRACTION_KEY];
		expect(runs.every((run) => run.brandMentioned && run.extractionStamp === extracted)).toBe(true);
	});

	it("queues runs never judged, which have no mentions row", async () => {
		const run = legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"));
		await insertLegacyRuns([run]);
		await db.delete(runMentions).where(eq(runMentions.runId, run.id));

		await replay({ brandId, layers: ["interpretation"] });

		expect((await runsInWalkOrder())[0].brandMentioned).toBe(true);
	});

	it("re-derives runs a pass already handled once the brand's config changes", async () => {
		const [competitor] = await db
			.insert(competitors)
			.values({ brandId, name: "Globex", domains: ["oldsite.example"] })
			.returning({ id: competitors.id });
		const answer = "According to newsite.example, Acme is the best CRM.";
		await insertLegacyRuns([legacyRun(answer, new Date("2026-02-01T10:00:00Z"))]);
		await replay({ brandId, layers: BOTH_LAYERS });
		expect((await runsInWalkOrder())[0].competitorsMentioned).toEqual([]);

		await db
			.update(competitors)
			.set({ domains: ["newsite.example"] })
			.where(eq(competitors.id, competitor.id));
		await replay({ brandId, layers: ["interpretation"] });

		expect((await runsInWalkOrder())[0].competitorsMentioned).toEqual(["Globex"]);
		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
		expect(brand.analysisVersions).toEqual(await currentVersions(brandId));
	});

	it("queues the last 30 days ahead of older history", async () => {
		const old = legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"));
		const recent = legacyRun("Acme is the best CRM.", new Date(Date.now() - 24 * 60 * 60 * 1000));
		await insertLegacyRuns([old, recent]);

		const queued = await replay({ brandId, layers: BOTH_LAYERS });

		expect(queued.map((job) => job.data.runIds)).toEqual([[recent.id], [old.id]]);
		expect(queued[0].priority).toBeGreaterThan(queued[1].priority);
	});

	it("rewrites only derived rows, since prompt_runs rejects updates", async () => {
		await insertLegacyRuns([legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"))]);
		await expect(
			db.update(promptRuns).set({ model: "other" }).where(eq(promptRuns.brandId, brandId)),
		).rejects.toMatchObject({
			cause: { message: expect.stringContaining("append-only") },
		});
		await expect(replay({ brandId, layers: BOTH_LAYERS })).resolves.toHaveLength(1);
	});

	it("skips a brand that no longer exists", async () => {
		await expect(replay({ brandId: "no-such-brand", layers: ["extraction"] })).resolves.toEqual([]);
	});
});

describe("fillLegacyText", () => {
	it("stores a legacy run's text from its payload and leaves its citations and mentions as recorded", async () => {
		const run = legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"));
		await insertLegacyRuns([run]);
		await db
			.update(runMentions)
			.set({ brandMentioned: true, competitorsMentioned: ["Globex"] })
			.where(eq(runMentions.runId, run.id));

		expect(await fillLegacyText(db)).toBeGreaterThanOrEqual(1);
		await db.update(runExtractions).set({ textContent: "Filled once." }).where(eq(runExtractions.runId, run.id));
		await fillLegacyText(db);
		expect((await runsInWalkOrder())[0].textContent).toBe("Filled once.");
		await db
			.update(runExtractions)
			.set({ textContent: "Acme is the best CRM." })
			.where(eq(runExtractions.runId, run.id));

		const [filled] = await runsInWalkOrder();
		expect(filled).toMatchObject({
			textContent: "Acme is the best CRM.",
			extractionStamp: LEGACY_EXTRACTION_STAMP,
			brandMentioned: true,
			competitorsMentioned: ["Globex"],
			mentionsStamp: null,
		});
		expect(await db.select().from(citations).where(eq(citations.promptRunId, run.id))).toEqual([]);
	});
});

describe("requestStaleReprocesses", () => {
	it("requests a pass toward today's stamps, and none once history matches", async () => {
		const first = fakeBoss();
		await requestStaleReprocesses(db, first.boss);
		expect(sentFor(first.send, brandId)).toEqual([{ brandId, layers: ["extraction", "interpretation"] }]);

		await replay(sentFor(first.send, brandId)[0]);
		const second = fakeBoss();
		await requestStaleReprocesses(db, second.boss);
		expect(sentFor(second.send, brandId)).toEqual([]);

		await db.insert(competitors).values({ brandId, name: "Globex", domains: ["globex.example"] });
		const afterEdit = fakeBoss();
		await requestStaleReprocesses(db, afterEdit.boss);
		expect(sentFor(afterEdit.send, brandId).map((data) => data.layers)).toEqual([["interpretation"]]);
	});

	it("does not replay the history of a brand that predates stamping, which adopts today's stamps instead", async () => {
		const legacyBrand = await createBrand(null);
		try {
			const before = fakeBoss();
			await requestStaleReprocesses(db, before.boss);
			expect(sentFor(before.send, legacyBrand)).toEqual([]);

			await adoptCurrentStamps(db);
			const [brand] = await db.select().from(brands).where(eq(brands.id, legacyBrand));
			expect(brand.analysisVersions).toEqual(await currentVersions(legacyBrand));

			const after = fakeBoss();
			await requestStaleReprocesses(db, after.boss);
			expect(sentFor(after.send, legacyBrand)).toEqual([]);
		} finally {
			await deleteBrand(legacyBrand);
		}
	});
});
