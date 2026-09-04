/**
 * Deterministic seed shared by analytics-read.integration.test.ts: one brand
 * (website acme.com, an additional domain, one alias), three competitors, six
 * prompts (two branded, one with a user tag override), ten days of runs across
 * three models — one of them with both a grounded/premium variant
 * (provider = 'openai-api', web_search_enabled = true) and a scraped variant —
 * and a small catalog of cited pages exercising normalizeUrl's folding rules
 * (a tracking parameter, a www + trailing-slash pair), a Google Shopping URL,
 * brand/competitor domains, and a null-title page.
 *
 * Every page below keeps exactly one title across every citation of it, and
 * one citationIndex across every run that cites it. The rollup classifies a
 * page per bucket from that bucket's latest title, while the raw path
 * classifies from the whole window's latest title — a URL whose title changes
 * between buckets can legitimately land in a different class under the two
 * paths, which is a real (if narrow) divergence documented in task 05a's
 * report, not a bug this seed should manufacture. Similarly, raw's
 * getCitationUrlStats groups by the *literal* url and rounds its average
 * position to one decimal before the equivalence check re-weights it by count
 * through rollUpCitationUrls; that only reconstructs the true average exactly
 * when the pre-rounded average was already exact, which a constant
 * citationIndex per page guarantees.
 */

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

/** A fixed "now" so lookback windows (1w/1m) are deterministic regardless of when the suite runs. */
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
	// The one prompt with a user tag override — unrelated to system_tags/branding.
	{ id: "dddddddd-0000-4000-8000-000000000006", value: "compare crm vendors", branded: false, tags: ["priority"] },
];

export const ALL_PROMPT_IDS = PROMPTS.map((p) => p.id);
export const BRANDED_PROMPT_IDS = PROMPTS.filter((p) => p.branded).map((p) => p.id);

/**
 * chatgpt gets both a grounded/premium reach (direct API call, web search on)
 * and a scraped one (no provider, i.e. the consumer surface) so the ::premium
 * model filter has something to split.
 */
const MODEL_VARIANTS: { model: string; provider: string | null; webSearchEnabled: boolean }[] = [
	{ model: "chatgpt", provider: "openai-api", webSearchEnabled: true },
	{ model: "chatgpt", provider: null, webSearchEnabled: false },
	{ model: "claude", provider: null, webSearchEnabled: false },
	{ model: "gemini", provider: null, webSearchEnabled: false },
];

/**
 * UTC instants chosen to sit one minute either side of a calendar-day boundary
 * in one of the three timezones the suite tests, plus one plain midday time:
 * 23:45 is 15 minutes before UTC's own midnight; 18:15 is 15 minutes before
 * midnight in Asia/Kolkata (the half-hour-offset zone the rollup plan calls
 * out); 06:59 is one minute before midnight in America/Los_Angeles while it
 * observes PDT (UTC-7), which is why the seed's ten days sit in early July.
 */
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

/** `SEED_RUNS[i].promptId === PROMPTS[i % PROMPTS.length].id` by construction. */
export const SEED_RUNS: SeedRun[] = buildSeedRuns();

interface SeedPage {
	/** Every entry normalizes to the same URL; the seed cites more than one variant to exercise normalizeUrl's folding. */
	urls: string[];
	domain: string;
	title: string | null;
	citationIndex: number;
}

const SEED_PAGES: SeedPage[] = [
	// Brand's own website — utm_source=openai stripping.
	{
		urls: ["https://acme.com/guide", "https://acme.com/guide?utm_source=openai"],
		domain: "acme.com",
		title: "Acme Guide",
		citationIndex: 0,
	},
	// Brand's additional domain.
	{ urls: ["https://acme.io/docs/api"], domain: "acme.io", title: "Acme API Docs", citationIndex: 1 },
	// A tracked competitor's domain.
	{ urls: ["https://globex.com/product"], domain: "globex.com", title: "Globex Product", citationIndex: 2 },
	// Unlisted domain, page-type fallback to editorial — www + trailing-slash stripping.
	{
		urls: ["https://example-blog.com/blog/best-crm-tools", "https://www.example-blog.com/blog/best-crm-tools/"],
		domain: "example-blog.com",
		title: "Best CRM Tools",
		citationIndex: 3,
	},
	// Curated review domain.
	{ urls: ["https://g2.com/products/acme/reviews"], domain: "g2.com", title: "Acme Reviews on G2", citationIndex: 4 },
	// Google Shopping surface — excluded from the source mix, stays in rollup_citation_urls as "google".
	{
		urls: ["https://www.google.com/search?q=widget&prds=pvt:hg,productid:123"],
		domain: "google.com",
		title: "Widget Product",
		citationIndex: 5,
	},
	// Curated ecommerce domain.
	{ urls: ["https://amazon.com/dp/B000123456"], domain: "amazon.com", title: "Widget on Amazon", citationIndex: 6 },
	// Curated forum domain.
	{
		urls: ["https://reddit.com/r/crm/comments/1/best_crm"],
		domain: "reddit.com",
		title: "Reddit thread about CRM",
		citationIndex: 7,
	},
	// Null title throughout.
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
			// 7 and 13 are coprime with 60 (the run count), which spreads a page's
			// citations across different prompts and days rather than clustering them.
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

/** Bucket-aligned bounds covering every seeded run. */
export const REBUILD_FROM = new Date("2026-07-01T00:00:00.000Z");
export const REBUILD_TO = new Date("2026-07-11T00:00:00.000Z");

export async function reset(db: DbConnection): Promise<void> {
	await db.execute(sql`
		TRUNCATE citations, prompt_runs, prompts, competitors, brands, organization,
			rollup_prompt_runs, rollup_competitor_mentions, rollup_citation_urls,
			rollup_citation_domains, cited_pages, rollup_dirty
		RESTART IDENTITY CASCADE
	`);
	await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING`);
	await db.execute(sql`
		UPDATE pipeline_state
		SET backfill_enqueued_at = NULL, backfill_completed_at = NULL, last_reconcile_at = NULL,
			rollup_version = 0, classifier_version = 0, extractor_version = 0, deriver_versions = '{}'
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

/** Seeds, rebuilds the whole span, and marks the backfill complete — the steady state most tests want. */
export async function seedAndRebuild(db: DbConnection): Promise<void> {
	await seed(db);
	await rebuildRange(db, BRAND_ID, REBUILD_FROM, REBUILD_TO);
	await setPipelineState(db, { backfillCompletedAt: new Date() });
}
