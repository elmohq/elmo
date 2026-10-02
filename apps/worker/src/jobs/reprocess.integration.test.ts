import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, citations, competitors, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import { mentionConfigFrom } from "@workspace/lib/mentions";
import { EXTRACTOR_VERSION } from "@workspace/lib/text-extraction";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	adoptCurrentStamps,
	type BossClient,
	brandVersions,
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

function fakeBoss(pendingStates: string[] = []) {
	const send = vi.fn().mockResolvedValue("job-id");
	const findJobs = vi.fn().mockResolvedValue(pendingStates.map((state) => ({ state })));
	return { send, findJobs, boss: { send, findJobs } as unknown as BossClient };
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
		brandMentioned: false,
		competitorsMentioned: [],
		createdAt,
	};
}

async function currentVersions(id: string) {
	const [brand] = await db.select().from(brands).where(eq(brands.id, id));
	const brandCompetitors = await db.select().from(competitors).where(eq(competitors.brandId, id));
	return brandVersions(mentionConfigFrom(brand, brandCompetitors));
}

async function runsInWalkOrder() {
	return db
		.select()
		.from(promptRuns)
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
		await db.insert(promptRuns).values(legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z")));

		const { boss, send } = fakeBoss();
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, boss);

		const [run] = await runsInWalkOrder();
		expect(run.textContent).toBe("Acme is the best CRM.");
		expect(run.extractorVersion).toBe(EXTRACTOR_VERSION);
		expect(run.brandMentioned).toBe(true);
		const cited = await db.select().from(citations).where(eq(citations.promptRunId, run.id));
		expect(cited.map((citation) => citation.url)).toEqual(["https://example.com/a"]);

		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
		expect(brand.analysisVersions).toEqual(await currentVersions(brandId));
		expect(sentFor(send, brandId)).toEqual([]);
	});

	it("leaves runs that are already current untouched", async () => {
		await db.insert(promptRuns).values(legacyRun("Acme is the best CRM.", new Date("2026-02-01T10:00:00Z")));
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);
		await db.update(promptRuns).set({ brandMentioned: false }).where(eq(promptRuns.brandId, brandId));

		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);

		const [run] = await runsInWalkOrder();
		expect(run.brandMentioned).toBe(false);
	});

	it("walks every run when more than a batch of them share one microsecond", async () => {
		const sharedInstant = sql`'2026-02-01 10:00:00.123456+00'::timestamptz`;
		await db
			.insert(promptRuns)
			.values(Array.from({ length: 450 }, () => legacyRun("Acme is the best CRM.", sharedInstant)));

		const { boss, send } = fakeBoss();
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, boss);

		const runs = await runsInWalkOrder();
		expect(runs).toHaveLength(450);
		expect(runs.every((run) => run.brandMentioned && run.extractorVersion === EXTRACTOR_VERSION)).toBe(true);
		expect(sentFor(send, brandId)).toEqual([]);
	});

	it("resumes a continuation exactly after its cursor, even inside a shared microsecond", async () => {
		const sharedInstant = sql`'2026-02-01 10:00:00.123456+00'::timestamptz`;
		await db
			.insert(promptRuns)
			.values(Array.from({ length: 450 }, () => legacyRun("Acme is the best CRM.", sharedInstant)));
		const ordered = await runsInWalkOrder();
		const done = ordered[199];

		await runReprocess(
			{
				brandId,
				layers: ["extraction", "interpretation"],
				target: await currentVersions(brandId),
				after: { promptId, last: { createdAt: "2026-02-01T10:00:00.123456Z", id: done.id } },
			},
			db,
			fakeBoss().boss,
		);

		const runs = await runsInWalkOrder();
		expect(runs.slice(0, 200).every((run) => run.extractorVersion === null)).toBe(true);
		expect(runs.slice(200).every((run) => run.extractorVersion === EXTRACTOR_VERSION)).toBe(true);
	});

	it("starts a continuation over when the brand's config changed after the pass began", async () => {
		const [competitor] = await db
			.insert(competitors)
			.values({ brandId, name: "Globex", domains: ["oldsite.example"] })
			.returning({ id: competitors.id });
		const answer = "According to newsite.example, Acme is the best CRM.";
		await db
			.insert(promptRuns)
			.values([
				legacyRun(answer, new Date("2026-02-01T10:00:00Z")),
				legacyRun(answer, new Date("2026-02-01T11:00:00Z")),
			]);
		// The pass's first segment handled the earlier run under the old config...
		const startedUnder = await currentVersions(brandId);
		await runReprocess({ brandId, layers: ["extraction", "interpretation"] }, db, fakeBoss().boss);
		const [first] = await runsInWalkOrder();
		expect(first.competitorsMentioned).toEqual([]);

		// ...then the config moved before its continuation ran.
		await db
			.update(competitors)
			.set({ domains: ["newsite.example"] })
			.where(eq(competitors.id, competitor.id));
		await runReprocess(
			{
				brandId,
				layers: ["extraction", "interpretation"],
				target: startedUnder,
				after: { promptId, last: { createdAt: "2026-02-01T10:00:00.000000Z", id: first.id } },
			},
			db,
			fakeBoss().boss,
		);

		const runs = await runsInWalkOrder();
		expect(runs.map((run) => run.competitorsMentioned)).toEqual([["Globex"], ["Globex"]]);
		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
		expect(brand.analysisVersions).toEqual(await currentVersions(brandId));
	});

	it("skips a brand that no longer exists", async () => {
		await expect(
			runReprocess({ brandId: "no-such-brand", layers: ["extraction"] }, db, fakeBoss().boss),
		).resolves.toBeUndefined();
	});
});

describe("requestStaleReprocesses", () => {
	it("requests a pass toward today's stamps, and none once history matches", async () => {
		const first = fakeBoss();
		await requestStaleReprocesses(db, first.boss);
		expect(sentFor(first.send, brandId)).toEqual([
			{ brandId, layers: ["extraction", "interpretation"], target: await currentVersions(brandId) },
		]);

		await runReprocess(sentFor(first.send, brandId)[0], db, fakeBoss().boss);
		const second = fakeBoss();
		await requestStaleReprocesses(db, second.boss);
		expect(sentFor(second.send, brandId)).toEqual([]);

		await db.insert(competitors).values({ brandId, name: "Globex", domains: ["globex.example"] });
		const afterEdit = fakeBoss();
		await requestStaleReprocesses(db, afterEdit.boss);
		expect(sentFor(afterEdit.send, brandId).map((data) => data.layers)).toEqual([["interpretation"]]);
	});

	it("leaves a brand alone while a pass for it is queued or running", async () => {
		const { boss, send } = fakeBoss(["active"]);
		await requestStaleReprocesses(db, boss);
		expect(sentFor(send, brandId)).toEqual([]);
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
