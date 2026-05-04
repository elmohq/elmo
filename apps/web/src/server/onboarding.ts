/**
 * Provider-agnostic onboarding server functions + the shared "create / update
 * brand from suggestion" path used by both the in-app wizard and the public
 * `/api/v1/onboarding/*` endpoints.
 *
 * Two distinct shapes:
 *   • createOnboardedBrand — for POST /api/v1/onboarding/brands. Pure create;
 *     throws BrandConflictError if the brandId already exists.
 *   • updateOnboardedBrand — for PATCH /api/v1/onboarding/brands/:brandId
 *     and the in-app wizard's save step. Merges new domains/aliases, adds
 *     net-new prompts/competitors (deduped against existing DB rows), and
 *     optionally re-runs analyzeBrand if generate flags are set.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, competitors } from "@workspace/lib/db/schema";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import {
	analyzeBrand,
	type OnboardingSuggestion,
} from "@workspace/lib/onboarding";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

// ============================================================================
// Errors
// ============================================================================

export class BrandConflictError extends Error {
	constructor(public readonly brandId: string) {
		super(`Brand "${brandId}" already exists. Use PATCH /api/v1/onboarding/brands/${brandId} to update.`);
		this.name = "BrandConflictError";
	}
}

export class BrandNotFoundError extends Error {
	constructor(public readonly brandId: string) {
		super(`Brand "${brandId}" not found.`);
		this.name = "BrandNotFoundError";
	}
}

// ============================================================================
// Shared schemas
// ============================================================================

const competitorInputSchema = z.object({
	name: z.string().min(1),
	domains: z.array(z.string()).optional().default([]),
	aliases: z.array(z.string()).optional().default([]),
});

const promptInputSchema = z.object({
	value: z.string().min(1),
	tags: z.array(z.string()).optional().default([]),
	enabled: z.boolean().optional().default(true),
});

const createOnboardedBrandInputSchema = z.object({
	brandId: z.string().min(1),
	brandName: z.string().min(1),
	website: z.string().min(1),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
	generateCompetitors: z.boolean().optional().default(true),
	generatePrompts: z.boolean().optional().default(true),
});

/** PATCH body — brandId comes from the URL path, not the body. */
const updateOnboardedBrandBodySchema = z.object({
	brandName: z.string().min(1).optional(),
	website: z.string().min(1).optional(),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
	generateCompetitors: z.boolean().optional().default(false),
	generatePrompts: z.boolean().optional().default(false),
});

const updateOnboardedBrandInputSchema = updateOnboardedBrandBodySchema.extend({
	brandId: z.string().min(1),
});

export type CreateOnboardedBrandInput = z.infer<typeof createOnboardedBrandInputSchema>;
export type UpdateOnboardedBrandInput = z.infer<typeof updateOnboardedBrandInputSchema>;

export interface OnboardedBrandResult {
	brandId: string;
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	promptsCreated: number;
	competitorsCreated: number;
	suggestion: OnboardingSuggestion | null;
}

// ============================================================================
// URL/domain helpers
// ============================================================================

function validateAndFormatWebsite(url: string): string {
	const trimmed = url.trim();
	const formatted = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
	const parsed = new URL(formatted);
	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Website URL must use http or https");
	}
	if (!parsed.hostname) {
		throw new Error("Website URL must have a valid hostname");
	}
	return formatted;
}

function dedupeDomains(values: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const v of values) {
		const cleaned = cleanAndValidateDomain(v);
		if (!cleaned || seen.has(cleaned)) continue;
		seen.add(cleaned);
		out.push(cleaned);
	}
	return out;
}

function dedupeAliases(values: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const v of values) {
		const trimmed = v.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

// ============================================================================
// Shared assembly helpers
// ============================================================================

interface CompetitorSource {
	name: string;
	domains: string[];
	aliases: string[];
}

interface PromptSource {
	value: string;
	tags: string[];
	enabled: boolean;
}

async function maybeAnalyzeBrand(args: {
	website: string;
	brandName: string;
	wantCompetitors: boolean;
	wantPrompts: boolean;
}): Promise<OnboardingSuggestion | null> {
	if (!args.wantCompetitors && !args.wantPrompts) return null;
	return analyzeBrand({
		website: args.website,
		brandName: args.brandName,
		includeCompetitors: args.wantCompetitors,
		includePrompts: args.wantPrompts,
	});
}

async function insertCompetitors(args: {
	brandId: string;
	websiteHost: string;
	source: CompetitorSource[];
}): Promise<number> {
	if (args.source.length === 0) return 0;

	const existing = await db.query.competitors.findMany({
		where: eq(competitors.brandId, args.brandId),
	});
	const existingDomains = new Set(existing.flatMap((c) => c.domains));

	const toInsert: Array<{ brandId: string; name: string; domains: string[]; aliases: string[] }> = [];
	for (const c of args.source) {
		const cleaned = dedupeDomains(c.domains).filter((d) => d !== args.websiteHost);
		if (cleaned.length === 0) continue;
		if (cleaned.some((d) => existingDomains.has(d))) continue;
		toInsert.push({
			brandId: args.brandId,
			name: c.name.trim(),
			domains: cleaned,
			aliases: dedupeAliases(c.aliases),
		});
	}
	if (toInsert.length === 0) return 0;

	const [{ count: currentCount }] = await db
		.select({ count: count() })
		.from(competitors)
		.where(eq(competitors.brandId, args.brandId));
	if ((currentCount || 0) + toInsert.length > MAX_COMPETITORS) {
		throw new Error(
			`Cannot add competitors. Would exceed maximum of ${MAX_COMPETITORS} (currently ${currentCount}, adding ${toInsert.length}).`,
		);
	}

	await db.insert(competitors).values(toInsert);
	return toInsert.length;
}

async function insertPrompts(args: {
	brandId: string;
	brandName: string;
	website: string;
	source: PromptSource[];
	dedupeAgainstExisting: boolean;
}): Promise<number> {
	if (args.source.length === 0) return 0;

	const seen = new Set<string>();
	if (args.dedupeAgainstExisting) {
		const existing = await db.query.prompts.findMany({
			where: eq(prompts.brandId, args.brandId),
		});
		for (const p of existing) seen.add(p.value.toLowerCase());
	}

	const rows: Array<{
		brandId: string;
		value: string;
		enabled: boolean;
		tags: string[];
		systemTags: string[];
	}> = [];
	for (const p of args.source) {
		const value = p.value.trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push({
			brandId: args.brandId,
			value,
			enabled: p.enabled,
			tags: p.tags,
			systemTags: computeSystemTags(value, args.brandName, args.website),
		});
	}
	if (rows.length === 0) return 0;

	const inserted = await db.insert(prompts).values(rows).returning({ id: prompts.id });
	await createMultiplePromptJobSchedulers(inserted.map((r) => r.id));
	return inserted.length;
}

function buildCompetitorSource(
	explicit: { name: string; domains: string[]; aliases: string[] }[],
	suggestion: OnboardingSuggestion | null,
): CompetitorSource[] {
	if (explicit.length > 0) {
		return explicit.map((c) => ({ name: c.name, domains: c.domains, aliases: c.aliases }));
	}
	return (suggestion?.competitors ?? []).map((c) => ({ name: c.name, domains: c.domains, aliases: c.aliases }));
}

function buildPromptSource(
	explicit: { value: string; tags: string[]; enabled: boolean }[],
	suggestion: OnboardingSuggestion | null,
): PromptSource[] {
	const explicitRows = explicit.map((p) => ({
		value: p.value.trim(),
		tags: sanitizeUserTags(p.tags ?? []),
		enabled: p.enabled,
	}));
	const generatedRows = (suggestion?.suggestedPrompts ?? []).map((p) => ({
		value: p.prompt.trim(),
		tags: sanitizeUserTags(p.tags ?? []),
		enabled: true,
	}));
	return [...explicitRows, ...generatedRows];
}

// ============================================================================
// createOnboardedBrand — pure create
// ============================================================================

/**
 * Create a brand and its prompts/competitors. Throws BrandConflictError if a
 * row with this brandId already exists — callers should use updateOnboardedBrand
 * to top up an existing record.
 *
 * Auth + org-access checks are the caller's responsibility; this function
 * trusts that the route/server-fn boundary already enforced them.
 */
export async function createOnboardedBrand(
	input: CreateOnboardedBrandInput,
): Promise<OnboardedBrandResult> {
	const formattedWebsite = validateAndFormatWebsite(input.website);
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");

	const conflict = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (conflict) throw new BrandConflictError(input.brandId);

	const explicitCompetitors = input.competitors ?? [];
	const explicitPrompts = input.prompts ?? [];

	const suggestion = await maybeAnalyzeBrand({
		website: formattedWebsite,
		brandName: input.brandName,
		wantCompetitors: input.generateCompetitors !== false && explicitCompetitors.length === 0,
		wantPrompts: input.generatePrompts !== false && explicitPrompts.length === 0,
	});

	const additionalDomains = dedupeDomains([
		...(input.additionalDomains ?? []),
		...(suggestion?.additionalDomains ?? []),
	]).filter((d) => d !== websiteHost);

	const aliases = dedupeAliases([...(input.aliases ?? []), ...(suggestion?.aliases ?? [])]);

	await db.insert(brands).values({
		id: input.brandId,
		name: input.brandName,
		website: formattedWebsite,
		additionalDomains,
		aliases,
		enabled: true,
	});

	const competitorsCreated = await insertCompetitors({
		brandId: input.brandId,
		websiteHost,
		source: buildCompetitorSource(
			explicitCompetitors.map((c) => ({ name: c.name, domains: c.domains ?? [], aliases: c.aliases ?? [] })),
			suggestion,
		),
	});

	const promptsCreated = await insertPrompts({
		brandId: input.brandId,
		brandName: input.brandName,
		website: formattedWebsite,
		source: buildPromptSource(
			explicitPrompts.map((p) => ({ value: p.value, tags: p.tags ?? [], enabled: p.enabled ?? true })),
			suggestion,
		),
		// Brand row was just created — no existing prompts to dedupe against.
		dedupeAgainstExisting: false,
	});

	await db.update(brands).set({ onboarded: true, updatedAt: new Date() }).where(eq(brands.id, input.brandId));

	return {
		brandId: input.brandId,
		brandName: input.brandName,
		website: formattedWebsite,
		additionalDomains,
		aliases,
		promptsCreated,
		competitorsCreated,
		suggestion,
	};
}

// ============================================================================
// updateOnboardedBrand — merge into an existing brand
// ============================================================================

/**
 * Top up an existing brand with additional domains/aliases/competitors/prompts.
 * Throws BrandNotFoundError if the brandId isn't already in the DB.
 *
 * Domains and aliases are merged into the existing arrays. New competitors are
 * inserted only if their domain set doesn't overlap an existing competitor's
 * domains. New prompts are inserted only if no existing prompt has the same
 * lowercased value — this is the fix for the previous "POST is half-idempotent"
 * behavior where re-posting the same body created duplicate prompts.
 */
export async function updateOnboardedBrand(
	input: UpdateOnboardedBrandInput,
): Promise<OnboardedBrandResult> {
	const existing = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!existing) throw new BrandNotFoundError(input.brandId);

	const formattedWebsite = input.website ? validateAndFormatWebsite(input.website) : existing.website;
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");
	const brandName = input.brandName?.trim() || existing.name;

	const explicitCompetitors = input.competitors ?? [];
	const explicitPrompts = input.prompts ?? [];

	const suggestion = await maybeAnalyzeBrand({
		website: formattedWebsite,
		brandName,
		wantCompetitors: input.generateCompetitors === true && explicitCompetitors.length === 0,
		wantPrompts: input.generatePrompts === true && explicitPrompts.length === 0,
	});

	const incomingDomains = dedupeDomains([
		...(input.additionalDomains ?? []),
		...(suggestion?.additionalDomains ?? []),
	]).filter((d) => d !== websiteHost);
	const incomingAliases = dedupeAliases([...(input.aliases ?? []), ...(suggestion?.aliases ?? [])]);

	const mergedDomains = dedupeDomains([...existing.additionalDomains, ...incomingDomains]);
	const mergedAliases = dedupeAliases([...existing.aliases, ...incomingAliases]);

	const brandPatch: Partial<typeof brands.$inferInsert> = { updatedAt: new Date(), onboarded: true };
	if (input.brandName && input.brandName.trim() !== existing.name) {
		brandPatch.name = brandName;
	}
	if (input.website && formattedWebsite !== existing.website) {
		brandPatch.website = formattedWebsite;
	}
	if (mergedDomains.length !== existing.additionalDomains.length) {
		brandPatch.additionalDomains = mergedDomains;
	}
	if (mergedAliases.length !== existing.aliases.length) {
		brandPatch.aliases = mergedAliases;
	}
	await db.update(brands).set(brandPatch).where(eq(brands.id, input.brandId));

	const competitorsCreated = await insertCompetitors({
		brandId: input.brandId,
		websiteHost,
		source: buildCompetitorSource(
			explicitCompetitors.map((c) => ({ name: c.name, domains: c.domains ?? [], aliases: c.aliases ?? [] })),
			suggestion,
		),
	});

	const promptsCreated = await insertPrompts({
		brandId: input.brandId,
		brandName,
		website: formattedWebsite,
		source: buildPromptSource(
			explicitPrompts.map((p) => ({ value: p.value, tags: p.tags ?? [], enabled: p.enabled ?? true })),
			suggestion,
		),
		dedupeAgainstExisting: true,
	});

	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	return {
		brandId: input.brandId,
		brandName: refreshed?.name ?? brandName,
		website: refreshed?.website ?? formattedWebsite,
		additionalDomains: refreshed?.additionalDomains ?? mergedDomains,
		aliases: refreshed?.aliases ?? mergedAliases,
		promptsCreated,
		competitorsCreated,
		suggestion,
	};
}

// ============================================================================
// Server functions (in-app wizard)
// ============================================================================

/**
 * Run brand analysis without saving anything. The caller decides what to keep
 * before invoking `updateOnboardedBrandFn`.
 */
export const analyzeBrandFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			website: z.string().min(1),
			brandName: z.string().optional(),
			includeCompetitors: z.boolean().optional().default(true),
			includePrompts: z.boolean().optional().default(true),
		}),
	)
	.handler(async ({ data }) => {
		await requireAuthSession();
		return analyzeBrand({
			website: data.website,
			brandName: data.brandName,
			includeCompetitors: data.includeCompetitors,
			includePrompts: data.includePrompts,
		});
	});

/**
 * Persist the wizard's reviewed onboarding result for a brand the user already
 * has access to. The brand row was created earlier in the signup flow (see
 * BrandOnboarding); this just tops it up with the user-confirmed prompts /
 * competitors / domains / aliases.
 */
export const updateOnboardedBrandFn = createServerFn({ method: "POST" })
	.inputValidator(updateOnboardedBrandInputSchema)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		return updateOnboardedBrand(data);
	});

export { createOnboardedBrandInputSchema, updateOnboardedBrandBodySchema, updateOnboardedBrandInputSchema };
