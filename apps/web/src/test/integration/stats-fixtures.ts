import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	citations,
	competitors,
	organization,
	promptRuns,
	prompts,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupDirty,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import { bucketEnd, bucketStart, rebuildRange } from "@workspace/lib/rollups";
import { eq, max, min } from "drizzle-orm";

/**
 * Every fixture brand gets its own organization and random ids, so test files
 * can share one database, run in parallel, and never see each other's rows.
 */
export async function createBrand(opts: { name?: string; website?: string; additionalDomains?: string[] } = {}) {
	const id = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
	await db.insert(brands).values({
		id,
		organizationId: id,
		name: opts.name ?? "Acme",
		website: opts.website ?? "https://acme.example",
		additionalDomains: opts.additionalDomains ?? [],
		onboarded: true,
	});
	return id;
}

export async function deleteBrand(brandId: string) {
	for (const table of [rollupPromptRuns, rollupCompetitorMentions, rollupCitationUrls, rollupDirty]) {
		await db.delete(table).where(eq(table.brandId, brandId));
	}
	await db.delete(citations).where(eq(citations.brandId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(competitors).where(eq(competitors.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
}

export async function createPrompt(
	brandId: string,
	opts: { value?: string; tags?: string[]; systemTags?: string[]; enabled?: boolean } = {},
) {
	const [row] = await db
		.insert(prompts)
		.values({
			brandId,
			value: opts.value ?? `prompt ${randomUUID()}`,
			tags: opts.tags ?? [],
			systemTags: opts.systemTags ?? ["unbranded"],
			enabled: opts.enabled ?? true,
		})
		.returning({ id: prompts.id });
	return row.id;
}

export async function createCompetitor(brandId: string, name: string, domains: string[] = []) {
	await db.insert(competitors).values({ brandId, name, domains });
}

export interface FixtureRun {
	id: string;
	promptId: string;
	brandId: string;
	model: string;
	createdAt: Date;
}

export async function createRun(
	brandId: string,
	promptId: string,
	opts: {
		at: string;
		brandMentioned: boolean;
		competitors?: string[];
		model?: string;
		provider?: string | null;
		webSearch?: boolean;
		webQueries?: string[];
	},
): Promise<FixtureRun> {
	const model = opts.model ?? "chatgpt";
	const createdAt = new Date(opts.at);
	const [row] = await db
		.insert(promptRuns)
		.values({
			promptId,
			brandId,
			model,
			provider: opts.provider === undefined ? "brightdata" : opts.provider,
			version: "test",
			webSearchEnabled: opts.webSearch ?? true,
			rawOutput: {},
			webQueries: opts.webQueries ?? [],
			brandMentioned: opts.brandMentioned,
			competitorsMentioned: opts.competitors ?? [],
			createdAt,
		})
		.returning({ id: promptRuns.id });
	return { id: row.id, promptId, brandId, model, createdAt };
}

export async function createCitation(
	run: FixtureRun,
	url: string,
	opts: { title?: string | null; index?: number } = {},
) {
	await db.insert(citations).values({
		promptRunId: run.id,
		promptId: run.promptId,
		brandId: run.brandId,
		model: run.model,
		url,
		domain: new URL(url).hostname.replace(/^www\./, ""),
		title: opts.title ?? null,
		citationIndex: opts.index ?? 1,
		createdAt: run.createdAt,
	});
}

/** Brings the brand's rollups up to date with its raw rows, as the worker's refresh would. */
export async function rebuildRollups(brandId: string) {
	const [span] = await db
		.select({ first: min(promptRuns.createdAt), last: max(promptRuns.createdAt) })
		.from(promptRuns)
		.where(eq(promptRuns.brandId, brandId));
	if (!span?.first || !span.last) return;
	await rebuildRange(db, brandId, bucketStart(span.first), bucketEnd(span.last));
}
