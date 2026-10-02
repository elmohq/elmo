// Every page keeps one title and one citationIndex throughout. The rollup classifies per
// bucket's latest title while raw uses the window's latest, and raw rounds average
// position before the equivalence check re-weights it; varying either would make the
// two paths legitimately diverge.

import type { DbConnection } from "@workspace/lib/db/db-connection";
import {
	brands,
	citations,
	competitors,
	organization,
	promptRuns,
	prompts,
	SYSTEM_TAGS,
} from "@workspace/lib/db/schema";
import { rebuildRange, setPipelineState } from "@workspace/lib/rollups";
import { sql } from "drizzle-orm";

export const ORG_ID = "org-analytics-read-test";
export const BRAND_ID = "brand-analytics-read-test";

export const NOW = new Date("2026-07-11T12:00:00.000Z");

export interface SeedCompetitor {
	id: string;
	name: string;
	domains: string[];
	aliases: string[];
}

export const COMPETITORS: SeedCompetitor[] = [
	{ id: "cccccccc-0000-4000-8000-000000000001", name: "Globex", domains: ["globex.com"], aliases: [] },
	{ id: "cccccccc-0000-4000-8000-000000000002", name: "Initech", domains: ["initech.com"], aliases: ["Initech Corp"] },
	{ id: "cccccccc-0000-4000-8000-000000000003", name: "Umbrella", domains: [], aliases: [] },
];

export interface SeedPrompt {
	id: string;
	value: string;
	branded: boolean;
	tags?: string[];
}

export const PROMPTS: SeedPrompt[] = [
	{ id: "dddddddd-0000-4000-8000-000000000001", value: "best acme alternative", branded: true },
	{ id: "dddddddd-0000-4000-8000-000000000002", value: "is acme.com worth it", branded: true },
	{ id: "dddddddd-0000-4000-8000-000000000003", value: "best crm software", branded: false },
	{ id: "dddddddd-0000-4000-8000-000000000004", value: "top project management tools", branded: false },
	{ id: "dddddddd-0000-4000-8000-000000000005", value: "crm for small business", branded: false },
	{ id: "dddddddd-0000-4000-8000-000000000006", value: "compare crm vendors", branded: false, tags: ["priority"] },
];

export const ALL_PROMPT_IDS = PROMPTS.map((p) => p.id);
export const BRANDED_PROMPT_IDS = PROMPTS.filter((p) => p.branded).map((p) => p.id);

const MODEL_VARIANTS: { model: string; provider: string | null; webSearchEnabled: boolean }[] = [
	{ model: "chatgpt", provider: "openai-api", webSearchEnabled: true },
	{ model: "chatgpt", provider: null, webSearchEnabled: false },
	{ model: "claude", provider: null, webSearchEnabled: false },
	{ model: "gemini", provider: null, webSearchEnabled: false },
];

// Just before midnight in UTC, Asia/Kolkata, and America/Los_Angeles (PDT, hence July),
// plus one midday slot.
const TIME_SLOTS = ["23:45:00", "18:15:00", "06:59:00", "12:30:00"];

const COMPETITOR_SUBSETS: string[][] = [[], ["Globex"], ["Initech", "Umbrella"], ["Globex", "Initech", "Umbrella"]];

const DAY_COUNT = 10;

function runId(n: number): string {
	return `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export interface SeedRun {
	id: string;
	promptId: string;
	createdAt: string;
	model: string;
	provider: string | null;
	webSearchEnabled: boolean;
	brandMentioned: boolean;
	competitorsMentioned: string[];
}

function buildSeedRuns(): SeedRun[] {
	const runs: SeedRun[] = [];
	for (let dayIndex = 0; dayIndex < DAY_COUNT; dayIndex++) {
		const day = `2026-07-${String(dayIndex + 1).padStart(2, "0")}`;
		for (let promptIndex = 0; promptIndex < PROMPTS.length; promptIndex++) {
			const n = dayIndex * PROMPTS.length + promptIndex;
			const variant = MODEL_VARIANTS[n % MODEL_VARIANTS.length];
			const time = TIME_SLOTS[n % TIME_SLOTS.length];
			runs.push({
				id: runId(n),
				promptId: PROMPTS[promptIndex].id,
				createdAt: `${day}T${time}.000Z`,
				model: variant.model,
				provider: variant.provider,
				webSearchEnabled: variant.webSearchEnabled,
				brandMentioned: n % 3 !== 0,
				competitorsMentioned: COMPETITOR_SUBSETS[n % COMPETITOR_SUBSETS.length],
			});
		}
	}
	return runs;
}

export const SEED_RUNS: SeedRun[] = buildSeedRuns();

interface SeedPage {
	/** Variants that all normalize to the same URL. */
	urls: string[];
	domain: string;
	title: string | null;
	citationIndex: number;
}

const SEED_PAGES: SeedPage[] = [
	{
		urls: ["https://acme.com/guide", "https://acme.com/guide?utm_source=openai"],
		domain: "acme.com",
		title: "Acme Guide",
		citationIndex: 0,
	},
	{ urls: ["https://acme.io/docs/api"], domain: "acme.io", title: "Acme API Docs", citationIndex: 1 },
	{ urls: ["https://globex.com/product"], domain: "globex.com", title: "Globex Product", citationIndex: 2 },
	{
		urls: ["https://example-blog.com/blog/best-crm-tools", "https://www.example-blog.com/blog/best-crm-tools/"],
		domain: "example-blog.com",
		title: "Best CRM Tools",
		citationIndex: 3,
	},
	{ urls: ["https://g2.com/products/acme/reviews"], domain: "g2.com", title: "Acme Reviews on G2", citationIndex: 4 },
	{
		urls: ["https://www.google.com/search?q=widget&prds=pvt:hg,productid:123"],
		domain: "google.com",
		title: "Widget Product",
		citationIndex: 5,
	},
	{ urls: ["https://amazon.com/dp/B000123456"], domain: "amazon.com", title: "Widget on Amazon", citationIndex: 6 },
	{
		urls: ["https://reddit.com/r/crm/comments/1/best_crm"],
		domain: "reddit.com",
		title: "Reddit thread about CRM",
		citationIndex: 7,
	},
	{ urls: ["https://docs.example.com/reference"], domain: "docs.example.com", title: null, citationIndex: 8 },
];

export interface SeedCitation {
	runId: string;
	url: string;
	domain: string;
	title: string | null;
	citationIndex: number;
}

const ATTACHMENTS_PER_PAGE = 3;

function buildSeedCitations(): SeedCitation[] {
	const out: SeedCitation[] = [];
	SEED_PAGES.forEach((page, pageIndex) => {
		for (let k = 0; k < ATTACHMENTS_PER_PAGE; k++) {
			// 7 and 13 are coprime with the run count, spreading a page's citations across prompts and days.
			const runIndex = (pageIndex * 7 + k * 13) % SEED_RUNS.length;
			const run = SEED_RUNS[runIndex];
			out.push({
				runId: run.id,
				url: page.urls[k % page.urls.length],
				domain: page.domain,
				title: page.title,
				citationIndex: page.citationIndex,
			});
		}
	});
	return out;
}

export const SEED_CITATIONS: SeedCitation[] = buildSeedCitations();

export const REBUILD_FROM = new Date("2026-07-01T00:00:00.000Z");
export const REBUILD_TO = new Date("2026-07-11T00:00:00.000Z");

export async function reset(db: DbConnection): Promise<void> {
	await db.execute(sql`
		TRUNCATE citations, prompt_runs, prompts, competitors, brands, organization,
			rollup_prompt_runs, rollup_competitor_mentions, rollup_citation_urls, cited_pages, rollup_dirty
		RESTART IDENTITY CASCADE
	`);
	await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING`);
	await db.execute(sql`
		UPDATE pipeline_state
		SET backfill_enqueued_at = NULL, backfill_completed_at = NULL, rollup_version = 0, classifier_version = 0
	`);
}

export async function seed(db: DbConnection): Promise<void> {
	await db.insert(organization).values({
		id: ORG_ID,
		name: "Analytics Read Test Org",
		slug: "analytics-read-test-org",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
	});
	await db.insert(brands).values({
		id: BRAND_ID,
		name: "Acme",
		website: "acme.com",
		additionalDomains: ["acme.io"],
		aliases: ["Acme Corp"],
		organizationId: ORG_ID,
	});
	await db
		.insert(competitors)
		.values(
			COMPETITORS.map((c) => ({ id: c.id, brandId: BRAND_ID, name: c.name, domains: c.domains, aliases: c.aliases })),
		);
	await db.insert(prompts).values(
		PROMPTS.map((p) => ({
			id: p.id,
			brandId: BRAND_ID,
			value: p.value,
			systemTags: [p.branded ? SYSTEM_TAGS.BRANDED : SYSTEM_TAGS.UNBRANDED],
			tags: p.tags ?? [],
		})),
	);
	await db.insert(promptRuns).values(
		SEED_RUNS.map((run) => ({
			id: run.id,
			promptId: run.promptId,
			brandId: BRAND_ID,
			model: run.model,
			provider: run.provider,
			version: "1",
			webSearchEnabled: run.webSearchEnabled,
			rawOutput: { text: "seed" },
			brandMentioned: run.brandMentioned,
			competitorsMentioned: run.competitorsMentioned,
			createdAt: new Date(run.createdAt),
		})),
	);

	const runById = new Map(SEED_RUNS.map((run) => [run.id, run]));
	await db.insert(citations).values(
		SEED_CITATIONS.map((citation) => {
			const run = runById.get(citation.runId);
			if (!run) throw new Error(`no seed run ${citation.runId}`);
			return {
				promptRunId: run.id,
				promptId: run.promptId,
				brandId: BRAND_ID,
				model: run.model,
				url: citation.url,
				domain: citation.domain,
				title: citation.title,
				citationIndex: citation.citationIndex,
				createdAt: new Date(run.createdAt),
			};
		}),
	);
}

export async function seedAndRebuild(db: DbConnection): Promise<void> {
	await seed(db);
	await rebuildRange(db, BRAND_ID, REBUILD_FROM, REBUILD_TO);
	await setPipelineState(db, { backfillCompletedAt: new Date() });
}
