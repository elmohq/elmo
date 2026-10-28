import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { MentionAssessment, RunMentionAssessments } from "../mentions";
import { markRunsDirty, refreshAllMarked } from "../rollups/dirty";
import { saveCompetitors } from "./competitors";
import { db } from "./db";
import { insertRuns } from "./runs";
import { brands, competitors, organization, prompts, rollupCompetitorMentions, runMentions } from "./schema";

// Truncates shared tables, so nothing else may use this database while it runs.

const ORG_ID = "org-competitors-test";
const BRAND_ID = "brand-competitors-test";
const PROMPT_ID = "cccccccc-0000-4000-8000-000000000001";

const ACME = { name: "Acme", domains: ["acme.com"], aliases: ["Acme Corp"] };
const GLOBEX = { name: "Globex", domains: ["globex.com"], aliases: [] };

const positive: MentionAssessment = { mentioned: true, probability: 0.9, sentiment: "positive", position: 1 };
const negative: MentionAssessment = { mentioned: true, probability: 0.8, sentiment: "negative", position: 2 };

async function seedBrand() {
	await db.execute(sql`
		TRUNCATE prompt_runs, prompts, competitors, brands, organization, rollup_competitor_mentions,
			rollup_prompt_runs, rollup_dirty
		RESTART IDENTITY CASCADE
	`);
	await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING`);
	await db
		.insert(organization)
		.values({ id: ORG_ID, name: "Org", slug: "competitors-test-org", createdAt: new Date() });
	await db.insert(brands).values({ id: BRAND_ID, name: "Elmo", website: "https://elmo.test", organizationId: ORG_ID });
	await db.insert(prompts).values({ id: PROMPT_ID, brandId: BRAND_ID, value: "best crm" });
}

/** Answers from long ago, judged under the names the competitors had then. */
async function seedHistory(runs: { at: string; competitors: Record<string, MentionAssessment> }[]) {
	await insertRuns(
		db,
		runs.map((run) => {
			const assessments: RunMentionAssessments = {
				competitors: run.competitors,
				judged: {
					brand: "fp-brand",
					competitors: Object.fromEntries(Object.keys(run.competitors).map((name) => [name, `fp-${name}`])),
				},
			};
			return {
				promptId: PROMPT_ID,
				brandId: BRAND_ID,
				model: "gpt-5",
				provider: null,
				version: "1",
				webSearchEnabled: false,
				rawOutput: { text: "seed" },
				createdAt: new Date(run.at),
				mentions: {
					brandMentioned: false,
					competitorsMentioned: Object.keys(run.competitors),
					assessments,
					stamp: "seed",
				},
			};
		}),
	);
	await markRunsDirty(db, null);
	await refreshAllMarked(db);
}

const save = (submitted: Parameters<typeof saveCompetitors>[2]) =>
	db.transaction((tx) => saveCompetitors(tx, BRAND_ID, submitted));

const roster = () =>
	db
		.select({ id: competitors.id, name: competitors.name })
		.from(competitors)
		.where(eq(competitors.brandId, BRAND_ID))
		.orderBy(asc(competitors.name));

/** Each company's mentions and sentiment as the dashboards read them, from the rollups. */
async function standings() {
	await refreshAllMarked(db);
	const rows = await db
		.select({
			name: rollupCompetitorMentions.competitorName,
			runs: sql<number>`sum(${rollupCompetitorMentions.runs})::int`,
			positive: sql<number>`sum(${rollupCompetitorMentions.positiveRuns})::int`,
			negative: sql<number>`sum(${rollupCompetitorMentions.negativeRuns})::int`,
		})
		.from(rollupCompetitorMentions)
		.groupBy(rollupCompetitorMentions.competitorName);
	return Object.fromEntries(rows.map(({ name, ...counts }) => [name, counts]));
}

beforeEach(seedBrand);

describe("saving competitor settings", () => {
	it("keeps every competitor's id when the settings are saved unchanged", async () => {
		const first = await save([ACME, GLOBEX]);
		const again = await save(first.map(({ id, name, domains, aliases }) => ({ id, name, domains, aliases })));
		expect(again.map((c) => c.id)).toEqual(first.map((c) => c.id));
	});

	it("keeps ids for callers that send none, matching by name, then by domain", async () => {
		const [acme, globex] = await save([ACME, GLOBEX]);
		await save([ACME, GLOBEX]);
		await save([
			{ ...ACME, aliases: [] },
			{ ...GLOBEX, name: "Globex Corporation" },
		]);
		expect(await roster()).toEqual([
			{ id: acme.id, name: "Acme" },
			{ id: globex.id, name: "Globex Corporation" },
		]);
	});

	it("adds and removes competitors without touching the ones that stay", async () => {
		const [acme] = await save([ACME, GLOBEX]);
		await save([
			{ id: acme.id, ...ACME },
			{ name: "Initech", domains: ["initech.com"], aliases: [] },
		]);
		const after = await roster();
		expect(after.map((c) => c.name)).toEqual(["Acme", "Initech"]);
		expect(after[0].id).toBe(acme.id);
	});

	it("shows a renamed competitor's whole history, sentiment included, under its new name", async () => {
		const [acme] = await save([ACME, GLOBEX]);
		await seedHistory([
			{ at: "2025-01-10T10:00:00.000Z", competitors: { Acme: positive, Globex: negative } },
			{ at: "2025-03-02T10:00:00.000Z", competitors: { Acme: negative } },
		]);

		await save([{ id: acme.id, ...ACME, name: "Acme Inc" }, GLOBEX]);

		expect(await standings()).toEqual({
			"Acme Inc": { runs: 2, positive: 1, negative: 1 },
			Globex: { runs: 1, positive: 0, negative: 1 },
		});
		expect((await roster()).find((c) => c.name === "Acme Inc")?.id).toBe(acme.id);
		// What it was judged under travels with it, so a replay knows what to ask again.
		const [first] = await db.select().from(runMentions).limit(1);
		expect(first.assessments?.judged.competitors["Acme Inc"]).toBe("fp-Acme");
		expect(first.assessments?.judged.competitors.Acme).toBeUndefined();
	});

	it("carries history through a rename sent without ids", async () => {
		await save([ACME]);
		await seedHistory([{ at: "2025-01-10T10:00:00.000Z", competitors: { Acme: positive } }]);

		await save([{ ...ACME, name: "Acme Inc" }]);

		expect(await standings()).toEqual({ "Acme Inc": { runs: 1, positive: 1, negative: 0 } });
	});

	it("lets two competitors swap names without merging their histories", async () => {
		const [acme, globex] = await save([ACME, GLOBEX]);
		await seedHistory([{ at: "2025-01-10T10:00:00.000Z", competitors: { Acme: positive, Globex: negative } }]);

		await save([
			{ id: acme.id, ...ACME, name: "Globex" },
			{ id: globex.id, ...GLOBEX, name: "Acme" },
		]);

		expect(await standings()).toEqual({
			Globex: { runs: 1, positive: 1, negative: 0 },
			Acme: { runs: 1, positive: 0, negative: 1 },
		});
	});

	it("shows a removed competitor's past mentions again when it's added back", async () => {
		await save([ACME, GLOBEX]);
		await seedHistory([{ at: "2025-01-10T10:00:00.000Z", competitors: { Acme: positive } }]);

		await save([GLOBEX]);
		expect((await roster()).map((c) => c.name)).toEqual(["Globex"]);

		await save([GLOBEX, ACME]);
		expect((await roster()).map((c) => c.name)).toEqual(["Acme", "Globex"]);
		expect((await standings()).Acme).toEqual({ runs: 1, positive: 1, negative: 0 });
	});

	it("rejects a save naming two competitors alike, or one this brand doesn't track", async () => {
		await expect(save([ACME, { ...GLOBEX, name: "acme" }])).rejects.toThrow(/Two competitors are named/);
		await expect(save([{ id: "dddddddd-0000-4000-8000-000000000001", ...ACME }])).rejects.toThrow(/no longer tracked/);
	});
});
