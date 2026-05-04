/**
 * Brand-onboarding server functions + the shared persistence helpers used by
 * both the in-app wizard and the public REST endpoints under /api/v1/brands.
 *
 * Three exported building blocks:
 *   • createBrand — pure create, no LLM, no merging. Throws BrandConflictError.
 *   • updateBrand — pure brand-level update (replace semantics on arrays).
 *     Throws BrandNotFoundError.
 *   • updateOnboardedBrandFn — server fn used only by the in-app wizard's save
 *     step. Bundles brand-field replace + net-new prompt/competitor inserts
 *     (deduped against existing DB rows) into one round-trip. Not exposed via
 *     the public API.
 *
 * The public API never invokes analyzeBrand under the hood. Callers who want
 * suggestions hit POST /api/v1/tools/analyze first, then feed the result into
 * POST /api/v1/brands themselves.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, competitors } from "@workspace/lib/db/schema";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

// ============================================================================
// Errors
// ============================================================================

export class BrandConflictError extends Error {
	constructor(public readonly brandId: string) {
		super(`Brand "${brandId}" already exists.`);
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
// Schemas
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

/** POST /api/v1/brands body. */
const createBrandInputSchema = z.object({
	brandId: z.string().min(1),
	brandName: z.string().min(1),
	website: z.string().min(1),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
});

/** PATCH /api/v1/brands/:brandId body. brandId comes from the URL. */
const updateBrandBodySchema = z.object({
	brandName: z.string().min(1).optional(),
	website: z.string().min(1).optional(),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
});

const updateBrandInputSchema = updateBrandBodySchema.extend({
	brandId: z.string().min(1),
});

/** Wizard save: brand-level fields + new prompts/competitors in one shot. */
const wizardOnboardingInputSchema = z.object({
	brandId: z.string().min(1),
	brandName: z.string().min(1).optional(),
	website: z.string().min(1).optional(),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandInputSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandInputSchema>;
export type WizardOnboardingInput = z.infer<typeof wizardOnboardingInputSchema>;

export interface BrandResult {
	brandId: string;
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	enabled: boolean;
	onboarded: boolean;
	promptsCreated: number;
	competitorsCreated: number;
}

// ============================================================================
// Helpers
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

function buildBrandResult(row: typeof brands.$inferSelect, promptsCreated = 0, competitorsCreated = 0): BrandResult {
	return {
		brandId: row.id,
		brandName: row.name,
		website: row.website,
		additionalDomains: row.additionalDomains,
		aliases: row.aliases,
		enabled: row.enabled,
		onboarded: row.onboarded,
		promptsCreated,
		competitorsCreated,
	};
}

async function insertCompetitors(args: {
	brandId: string;
	websiteHost: string;
	source: { name: string; domains: string[]; aliases: string[] }[];
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
	source: { value: string; tags: string[]; enabled: boolean }[];
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

// ============================================================================
// createBrand — pure create
// ============================================================================

/**
 * Create a brand row (and optional initial competitors/prompts) exactly as
 * the caller supplied them. No LLM call, no merging with anything else.
 * Throws BrandConflictError if a brand with this brandId already exists.
 */
export async function createBrand(input: CreateBrandInput): Promise<BrandResult> {
	const formattedWebsite = validateAndFormatWebsite(input.website);
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");

	const conflict = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (conflict) throw new BrandConflictError(input.brandId);

	const additionalDomains = dedupeDomains(input.additionalDomains ?? []).filter((d) => d !== websiteHost);
	const aliases = dedupeAliases(input.aliases ?? []);

	await db.insert(brands).values({
		id: input.brandId,
		name: input.brandName,
		website: formattedWebsite,
		additionalDomains,
		aliases,
		enabled: true,
		// Programmatic creation skips the in-app onboarding wizard.
		onboarded: true,
	});

	const competitorsCreated = await insertCompetitors({
		brandId: input.brandId,
		websiteHost,
		source: (input.competitors ?? []).map((c) => ({
			name: c.name,
			domains: c.domains ?? [],
			aliases: c.aliases ?? [],
		})),
	});

	const promptsCreated = await insertPrompts({
		brandId: input.brandId,
		brandName: input.brandName,
		website: formattedWebsite,
		source: (input.prompts ?? []).map((p) => ({
			value: p.value,
			tags: sanitizeUserTags(p.tags ?? []),
			enabled: p.enabled ?? true,
		})),
		// Brand row was just created — no existing prompts to dedupe against.
		dedupeAgainstExisting: false,
	});

	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	return buildBrandResult(refreshed!, promptsCreated, competitorsCreated);
}

// ============================================================================
// updateBrand — pure brand-level update
// ============================================================================

/**
 * Update brand-level fields. Replace semantics: any array field the caller
 * provides replaces the existing value verbatim. Throws BrandNotFoundError
 * if the brand doesn't exist. Doesn't touch prompts or competitors — those
 * are managed via /api/v1/prompts and (TODO) /api/v1/competitors.
 */
export async function updateBrand(input: UpdateBrandInput): Promise<BrandResult> {
	const existing = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!existing) throw new BrandNotFoundError(input.brandId);

	const formattedWebsite = input.website ? validateAndFormatWebsite(input.website) : null;
	const websiteHost = formattedWebsite
		? new URL(formattedWebsite).hostname.replace(/^www\./, "")
		: existing.website
			? new URL(existing.website).hostname.replace(/^www\./, "")
			: null;

	const patch: Partial<typeof brands.$inferInsert> = { updatedAt: new Date() };
	if (input.brandName !== undefined) patch.name = input.brandName;
	if (formattedWebsite !== null) patch.website = formattedWebsite;
	if (input.additionalDomains !== undefined) {
		patch.additionalDomains = dedupeDomains(input.additionalDomains).filter((d) => d !== websiteHost);
	}
	if (input.aliases !== undefined) patch.aliases = dedupeAliases(input.aliases);
	if (input.enabled !== undefined) patch.enabled = input.enabled;

	await db.update(brands).set(patch).where(eq(brands.id, input.brandId));
	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	return buildBrandResult(refreshed!);
}

// ============================================================================
// Wizard save — brand fields + new prompts/competitors in one shot
// ============================================================================

async function saveWizardOnboarding(input: WizardOnboardingInput): Promise<BrandResult> {
	const existing = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!existing) throw new BrandNotFoundError(input.brandId);

	const formattedWebsite = input.website ? validateAndFormatWebsite(input.website) : existing.website;
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");
	const brandName = input.brandName?.trim() || existing.name;

	const patch: Partial<typeof brands.$inferInsert> = { updatedAt: new Date(), onboarded: true };
	if (input.brandName !== undefined && input.brandName.trim() !== existing.name) patch.name = brandName;
	if (input.website !== undefined && formattedWebsite !== existing.website) patch.website = formattedWebsite;
	if (input.additionalDomains !== undefined) {
		patch.additionalDomains = dedupeDomains(input.additionalDomains).filter((d) => d !== websiteHost);
	}
	if (input.aliases !== undefined) patch.aliases = dedupeAliases(input.aliases);
	await db.update(brands).set(patch).where(eq(brands.id, input.brandId));

	const competitorsCreated = await insertCompetitors({
		brandId: input.brandId,
		websiteHost,
		source: (input.competitors ?? []).map((c) => ({
			name: c.name,
			domains: c.domains ?? [],
			aliases: c.aliases ?? [],
		})),
	});

	const promptsCreated = await insertPrompts({
		brandId: input.brandId,
		brandName,
		website: formattedWebsite,
		source: (input.prompts ?? []).map((p) => ({
			value: p.value,
			tags: sanitizeUserTags(p.tags ?? []),
			enabled: p.enabled ?? true,
		})),
		dedupeAgainstExisting: true,
	});

	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	return buildBrandResult(refreshed!, promptsCreated, competitorsCreated);
}

// ============================================================================
// Server functions (in-app wizard)
// ============================================================================

/** Run brand analysis without saving anything. */
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
 * Persist the wizard's reviewed onboarding result for a brand the user
 * already has access to. The brand row was created earlier in the signup
 * flow (see BrandOnboarding); this just tops it up with the user-confirmed
 * brand fields, prompts, and competitors.
 */
export const updateOnboardedBrandFn = createServerFn({ method: "POST" })
	.inputValidator(wizardOnboardingInputSchema)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		return saveWizardOnboarding(data);
	});

export {
	createBrandInputSchema,
	updateBrandBodySchema,
	updateBrandInputSchema,
};
