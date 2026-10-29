import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { bucketEnd, bucketStart, rebuildRange } from "@workspace/lib/rollups";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgReader } from "@/lib/analytics/pg-reader";
import { assembleBundle, manifestVersion } from "@/lib/brand-data/chunks";
import { buildChunks, chunkManifest } from "@/lib/brand-data/chunks.server";
import { createMemoryReader } from "@/lib/brand-data/memory-reader";
import { loadQuoteTexts } from "@/lib/brand-data/quote-texts.server";
import { decodeBrandBundle, setBrandStore } from "@/lib/brand-data/store";
import { computations } from "@/lib/brand-data/worker/computations";
import type { LocalComputation } from "@/lib/brand-data/worker/protocol";
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
const memoryReader = createMemoryReader(loadQuoteTexts);

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

async function syncLocalCopy() {
	const manifest = await chunkManifest(brandId);
	const bundle = assembleBundle(brandId, manifestVersion(manifest), await buildChunks(brandId, manifest));
	if (!bundle) throw new Error("No entities chunk");
	setBrandStore(decodeBrandBundle(bundle));
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

function inputs(name: LocalComputation): Record<string, unknown>[] {
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
	it.each(Object.keys(computations) as LocalComputation[])("computes %s exactly as the server does", async (name) => {
		for (const input of inputs(name)) {
			const server = await computations[name](pgReader, input as never);
			const local = await computations[name](memoryReader, input as never);
			expect(local, JSON.stringify(input)).toEqual(server);
		}
	});
});

describe("brand data versions", () => {
	const versions = async () => new Map((await chunkManifest(brandId)).map((entry) => [entry.id, entry.hash]));
	const changed = (before: Map<string, string>, after: Map<string, string>) =>
		[...after]
			.filter(([id, hash]) => before.get(id) !== hash)
			.map(([id]) => id)
			.sort();

	it("moves only the chunks whose rows a refresh rewrote", async () => {
		const before = await versions();
		const at = new Date("2026-04-02T12:00:00Z");
		await createRun(brandId, promptIds.crm, { at: at.toISOString(), brandMentioned: true, webSearch: false });
		await rebuildRange(db, brandId, bucketStart(at), bucketEnd(at));
		expect(changed(before, await versions())).toEqual(["promptRuns:2026-04"]);
	});

	it("moves the entities when a prompt changes", async () => {
		const before = await versions();
		await db
			.update(prompts)
			.set({ tags: ["sales", "renamed"] })
			.where(eq(prompts.id, promptIds.startups));
		expect(changed(before, await versions())).toEqual(["entities"]);
	});
});
