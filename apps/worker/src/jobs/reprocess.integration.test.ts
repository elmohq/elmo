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
	return currentAnalysisVersions(mentionConfigFrom(brand, brandCompetitors));
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

describe("runReprocess", () => {
	it("extracts a stored run's text and citations, derives its mentions, and stamps the brand", async () => {
		await insertLegacyRuns([legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"))]);

		const { boss, send } = fakeBoss();
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, boss);

		const [run] = await runsInWalkOrder();
		expect(run.textContent).toBe("Acme is the best CRM.");
		const current = await currentVersions(brandId);
		expect([run.extractionStamp, run.mentionsStamp]).toEqual([current[EXTRACTION_KEY], current[MENTIONS_KEY]]);
		expect(run.brandMentioned).toBe(true);
		const cited = await db.select().from(citations).where(eq(citations.promptRunId, run.id));
		expect(cited.map((citation) => citation.url)).toEqual(["https://example.com/a"]);

		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
		expect(brand.analysisVersions).toEqual(await currentVersions(brandId));
		expect(send).not.toHaveBeenCalled();
	});

	it("leaves runs that are already current untouched", async () => {
		await insertLegacyRuns([legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"))]);
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);
		await db.update(runMentions).set({ brandMentioned: false });

		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);

		const [run] = await runsInWalkOrder();
		expect(run.brandMentioned).toBe(false);
	});

	it("walks every run when more than a batch of them share one microsecond", async () => {
		const sharedInstant = sql`'2026-02-01 10:00:00.123456+00'::timestamptz`;
		await insertLegacyRuns(Array.from({ length: 450 }, () => legacyRun("Acme is the best CRM.", sharedInstant)));

		const { boss, send } = fakeBoss();
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, boss);

		const runs = await runsInWalkOrder();
		expect(runs).toHaveLength(450);
		const extracted = (await currentVersions(brandId))[EXTRACTION_KEY];
		expect(runs.every((run) => run.brandMentioned && run.extractionStamp === extracted)).toBe(true);
		expect(send).not.toHaveBeenCalled();
	});

	it("re-derives runs a pass already handled when the brand's config changes before it finishes", async () => {
		const [competitor] = await db
			.insert(competitors)
			.values({ brandId, name: "Globex", domains: ["oldsite.example"] })
			.returning({ id: competitors.id });
		const answer = "According to newsite.example, Acme is the best CRM.";
		await insertLegacyRuns([legacyRun(answer, new Date("2026-02-01T10:00:00Z"))]);
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);
		expect((await runsInWalkOrder())[0].competitorsMentioned).toEqual([]);

		// The same pass's continuation, after the config moved.
		await db
			.update(competitors)
			.set({ domains: ["newsite.example"] })
			.where(eq(competitors.id, competitor.id));
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);

		expect((await runsInWalkOrder())[0].competitorsMentioned).toEqual(["Globex"]);
		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
		expect(brand.analysisVersions).toEqual(await currentVersions(brandId));
	});

	it("rewrites only derived rows, since prompt_runs rejects updates", async () => {
		await insertLegacyRuns([legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"))]);
		await expect(
			db.update(promptRuns).set({ model: "other" }).where(eq(promptRuns.brandId, brandId)),
		).rejects.toMatchObject({
			cause: { message: expect.stringContaining("append-only") },
		});
		await expect(
			runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss),
		).resolves.toBeUndefined();
	});

	it("skips a brand that no longer exists", async () => {
		await expect(
			runReprocess({ brandId: "no-such-brand", layers: ["extraction"] }, db, fakeBoss().boss),
		).resolves.toBeUndefined();
	});
});

describe("fillLegacyText", () => {
	it("stores a legacy run's text from its payload and leaves its citations and mentions as recorded", async () => {
		const run = legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z"));
		await insertLegacyRuns([run]);
		await db.update(runMentions).set({ brandMentioned: true, competitorsMentioned: ["Globex"] });

		expect(await fillLegacyText(db)).toBe(1);
		expect(await fillLegacyText(db)).toBe(0);

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

		await runReprocess(sentFor(first.send, brandId)[0], db, fakeBoss().boss);
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
