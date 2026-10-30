import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { bucketEnd, bucketStart, rebuildRange, resolveUnpagedCitations } from "@workspace/lib/rollups";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgReader } from "@/lib/analytics/pg-reader";
import type { AnalyticsReader } from "@/lib/analytics/reader";
import { decodeChunks, type EntitiesChunk, encodeChunks } from "@/lib/brand-data/chunks";
import { brandVersions, buildChunk } from "@/lib/brand-data/chunks.server";
import { applyChunk, compactRollups, joinPages } from "@/lib/brand-data/duck/engine";
import { duckQuery } from "@/lib/brand-data/duck/query";
import { createDuckReader } from "@/lib/brand-data/duck/reader";
import { loadQuoteTexts } from "@/lib/brand-data/quote-texts.server";
import { computations } from "@/lib/brand-data/worker/computations";
import type { BrandComputation } from "@/lib/brand-data/worker/protocol";
import { openTestDuck } from "@/test/duck";
import {
	createBrand,
	createCitation,
	createCompetitor,
	createPrompt,
	createRun,
	deleteBrand,
	rebuildRollups,
} from "@/test/integration/stats-fixtures";

let brandId: string;
const promptIds: Record<string, string> = {};
let duckReader: AnalyticsReader;

const assessed = (
	text: string,
	brand: { sentiment: MentionAssessment["sentiment"]; position: number } | null,
	competitors: Record<string, { sentiment: MentionAssessment["sentiment"]; position: number }> = {},
): { text: string; assessments: RunMentionAssessments } => {
	const judge = (sentiment: MentionAssessment["sentiment"], position: number): MentionAssessment => ({
		mentioned: true,
		probability: 0.98,
		sentiment,
		sentimentProbabilities: sentiment ? { [sentiment]: 0.6 + position / 10 } : undefined,
		passage: { start: 0, end: Math.min(text.length, 20) },
		position,
	});
	return {
		text,
		assessments: {
			brand: brand ? judge(brand.sentiment, brand.position) : undefined,
			competitors: Object.fromEntries(
				Object.entries(competitors).map(([name, c]) => [name, judge(c.sentiment, c.position)]),
			),
			judged: { brand: "acme", competitors: {} },
		},
	};
};

const FIXTURE_TARGETS = [
	{ model: "chatgpt", provider: "brightdata", webSearch: true },
	{ model: "chatgpt", provider: "openai-api", webSearch: true },
	{ model: "claude", provider: "anthropic-api", webSearch: false },
];
const FIXTURE_DAYS = [
	"2026-02-27",
	"2026-02-28",
	"2026-03-01",
	"2026-03-02",
	"2026-03-15",
	"2026-03-31",
	"2026-04-01",
	"2026-04-02",
];
const SENTIMENTS = ["positive", "negative", "mixed", "neutral"] as const;

async function createFixtureRun(
	n: number,
	day: string,
	key: string,
	promptId: string,
	target: (typeof FIXTURE_TARGETS)[number],
) {
	const mentioned = n % 3 !== 0;
	const rivals = n % 2 === 0 ? ["Globex"] : n % 5 === 0 ? ["Globex", "Initech"] : [];
	const { text, assessments } = assessed(
		`Answer ${n} about ${key}: Acme and friends compared at length.`,
		mentioned ? { sentiment: SENTIMENTS[n % 4], position: 1 + (n % 3) } : null,
		Object.fromEntries(rivals.map((name, i) => [name, { sentiment: SENTIMENTS[(n + i) % 4], position: 2 + i }])),
	);
	const run = await createRun(brandId, promptId, {
		at: `${day}T${n % 2 === 0 ? "03:30" : "18:10"}:00Z`,
		brandMentioned: mentioned,
		competitors: rivals,
		...target,
		webQueries: target.webSearch ? [`${key} options ${n % 4}`, "crm comparison"] : [],
		text,
		assessments,
	});
	if (!target.webSearch) return;
	const cited = [
		[`https://docs.acme.example/guide/${n % 3}`, "Acme guide"],
		[`https://globex.example/pricing/${n % 2}`, "Globex pricing"],
		[`https://www.reddit.com/r/crm/comments/${n % 4}/acme`, "Acme thread"],
		[`https://review.example/best-crm-${day}`, "Best CRMs"],
		[`https://www.google.com/search?q=acme+crm+${n % 3}`, null],
		[`https://www.google.com/shopping/product/${n % 4}?q=Acme+Pro`, "Acme Pro"],
	] as const;
	for (const [i, [url, title]] of cited.entries()) await createCitation(run, url, { title, index: i + 1 });
}

/** Syncs the brand as the browser does: every chunk, through the wire format, into DuckDB. */
async function syncLocalCopy() {
	const { chunks, entities } = await brandVersions(brandId);
	const built = await Promise.all(chunks.map((entry) => buildChunk(brandId, entry, entities)));
	const db = await openTestDuck();
	const writer = db.connect();
	let synced: EntitiesChunk | undefined;
	for (const chunk of decodeChunks(encodeChunks(built))) {
		if (chunk.entities) synced = chunk.entities;
		await applyChunk(writer, brandId, chunk);
	}
	await joinPages(writer);
	await compactRollups(writer);
	const ids = new Set(chunks.map((entry) => entry.id));
	const conn = db.connect();
	duckReader = createDuckReader(
		() => duckQuery(conn),
		{ entities: () => synced, coverage: () => ({ available: ids, loaded: ids }) },
		loadQuoteTexts,
	);
}

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example", additionalDomains: ["acme.dev"] });
	await createCompetitor(brandId, "Globex", ["globex.example"]);
	await createCompetitor(brandId, "Initech", ["initech.example"]);
	promptIds.crm = await createPrompt(brandId, { value: "best crm", tags: ["sales"] });
	promptIds.pricing = await createPrompt(brandId, { value: "acme pricing", systemTags: ["branded"] });
	promptIds.startups = await createPrompt(brandId, { value: "crm for startups", tags: ["sales", "startup"] });
	promptIds.retired = await createPrompt(brandId, { value: "old prompt", enabled: false });

	let n = 0;
	for (const day of FIXTURE_DAYS) {
		for (const [key, promptId] of Object.entries(promptIds)) {
			for (const target of FIXTURE_TARGETS) await createFixtureRun(++n, day, key, promptId, target);
		}
	}
	await rebuildRollups(brandId);
	await syncLocalCopy();
}, 120_000);

afterAll(async () => {
	await deleteBrand(brandId);
});

const ranges = ["2026-03-01..2026-03-31", "2026-02-15..2026-04-15", "all"];
const timezones = ["UTC", "America/New_York", "Asia/Kolkata"];
const filters = [{}, { model: "chatgpt" }, { model: "chatgpt::premium" }, { tags: "sales" }];

function inputs(name: BrandComputation): Record<string, unknown>[] {
	const base = ranges.flatMap((lookback) => filters.map((filter) => ({ brandId, lookback, ...filter })));
	const zoned = base.flatMap((input) => timezones.map((timezone) => ({ ...input, timezone })));
	switch (name) {
		case "shareOfVoice":
		case "batchChartData":
		case "filteredVisibility":
			return [...zoned, { brandId, lookback: "all", timezone: "UTC", search: "crm" }];
		case "promptsSummary":
			return [...zoned, { brandId, lookback: "all", timezone: "UTC", webSearchEnabled: "true" }];
		case "queryFanout":
			return [...zoned, { brandId, lookback: "all", timezone: "UTC", promptId: promptIds.crm }];
		case "citations":
			return base;
		case "citationUrls":
			return base.flatMap((input) => [
				{ ...input, page: 0, pageSize: 5 },
				{ ...input, page: 1, pageSize: 5, category: "brand" },
				{ ...input, page: 0, pageSize: 5, search: "acme" },
			]);
		case "citationDomains":
			return base.flatMap((input) => [
				{ ...input, page: 0, pageSize: 10 },
				{ ...input, page: 0, pageSize: 10, category: "competitor", search: "glob" },
			]);
		case "googleShopping":
			return base.flatMap((input) => [
				{ ...input, list: "products", attribution: "all", page: 0, pageSize: 10 },
				{ ...input, list: "queries", page: 0, pageSize: 5 },
			]);
		case "citationFlow":
			return base.flatMap((input) => [
				{ ...input, domain: "acme.example" },
				{ ...input, domain: "reddit.com" },
			]);
		default:
			return zoned;
	}
}

describe("a brand's local copy", () => {
	it.each(Object.keys(computations) as BrandComputation[])("computes %s exactly as the server does", async (name) => {
		for (const input of inputs(name)) {
			const server = await computations[name](pgReader, input as never);
			const local = await computations[name](duckReader, input as never);
			expect(local, JSON.stringify(input)).toEqual(server);
		}
	});
});

describe("brand data versions", () => {
	const versions = async () =>
		new Map((await brandVersions(brandId)).chunks.map((entry) => [entry.id, entry.version] as const));
	const changed = (before: Map<string, string>, after: Map<string, string>) =>
		[...after]
			.filter(([id, version]) => before.get(id) !== version)
			.map(([id]) => id)
			.sort();

	it("moves only the months a refresh rewrote", async () => {
		const before = await versions();
		const at = new Date("2026-04-02T12:00:00Z");
		await createRun(brandId, promptIds.crm, { at: at.toISOString(), brandMentioned: true, webSearch: false });
		await rebuildRange(db, brandId, bucketStart(at), bucketEnd(at));
		expect(changed(before, await versions())).toEqual(["citations:2026-04", "runs:2026-04"]);
	});

	it("moves the range of pages, and their text, a newly cited page lands in", async () => {
		const before = await versions();
		const at = new Date("2026-04-02T13:00:00Z");
		const run = await createRun(brandId, promptIds.crm, { at: at.toISOString(), brandMentioned: true });
		await createCitation(run, "https://new.example/first-citation");
		await resolveUnpagedCitations(db);
		await rebuildRange(db, brandId, bucketStart(at), bucketEnd(at));
		const moved = changed(before, await versions());
		const range = moved.find((id) => id.startsWith("pages:"))?.slice("pages:".length);
		expect(moved).toEqual(["citations:2026-04", `pages:${range}`, "runs:2026-04", `urls:${range}`]);
	});

	it("versions the current month by day, so a refresh moves only the day it rebuilt", async () => {
		const today = new Date();
		const at = (hour: number) =>
			new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hour));
		const day = at(0).toISOString().slice(0, 10);
		await createRun(brandId, promptIds.crm, { at: at(1).toISOString(), brandMentioned: true, webSearch: false });
		await rebuildRange(db, brandId, bucketStart(at(1)), bucketEnd(at(1)));
		const before = await versions();
		await createRun(brandId, promptIds.crm, { at: at(2).toISOString(), brandMentioned: false, webSearch: false });
		await rebuildRange(db, brandId, bucketStart(at(2)), bucketEnd(at(2)));
		expect(changed(before, await versions())).toEqual([`citations:${day}`, `runs:${day}`]);
	});

	it("moves the entities when a prompt changes", async () => {
		const before = await versions();
		await db
			.update(prompts)
			.set({ tags: ["sales", "renamed"] })
			.where(eq(prompts.id, promptIds.startups));
		expect(changed(before, await versions())).toEqual(["entities"]);
	});

	it("lists each month the brand has runs in", async () => {
		const { chunks } = await brandVersions(brandId);
		expect(chunks.filter((entry) => entry.id.startsWith("runs:")).map((entry) => entry.id)).toEqual([
			"runs:2026-02",
			"runs:2026-03",
			"runs:2026-04",
			expect.stringMatching(/^runs:\d{4}-\d{2}-\d{2}$/),
		]);
	});
});
