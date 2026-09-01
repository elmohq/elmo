/**
 * Brand-onboarding persistence helpers. Server-only — used by the API routes
 * under /api/v1/brands and by the server functions in ./onboarding.ts.
 *
 * Separated from onboarding.ts so that client components importing server
 * functions don't transitively pull in db/drizzle/pg (which breaks the
 * client bundle). Server functions live in onboarding.ts; everything else
 * lives here.
 */

import { slugify } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { ensureOrganization } from "@workspace/lib/db/provisioning";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { claimNewBrandSlug, findUnusedBrandSlug } from "@workspace/lib/db/unique-names";
import { assertCanAddPrompts, assertCompetitorCap, getBrandOrganizationId } from "@workspace/lib/entitlements";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { count, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { dedupeAliases, dedupeDomains } from "@/lib/domain-categories";
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

type CompetitorInput = z.infer<typeof competitorInputSchema>;
type PromptInput = z.infer<typeof promptInputSchema>;

/**
 * POST /api/v1/brands body.
 *
 * The API speaks a single `domains` list to mirror the competitor endpoints.
 * Internally, the first cleaned entry is stored as the brand's `website`
 * (`https://<host>`) and the rest are stored in `additionalDomains`.
 */
export const createBrandInputSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	domains: z.array(z.string()).min(1),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
	/**
	 * Organization to create the brand in. An organization key may only name its
	 * own; an admin key may name any that already exists. Omitted, an
	 * organization key creates inside its own and an admin key provisions a new
	 * organization for the brand — the only way to create one over the API.
	 */
	organizationId: z.string().min(1).optional(),
});

/** PATCH /api/v1/brands/:brandId body. brandId comes from the URL. */
export const updateBrandBodySchema = z.object({
	brandName: z.string().min(1).optional(),
	domains: z.array(z.string()).min(1).optional(),
	aliases: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
});

/** Wizard save: brand-level fields + new prompts/competitors in one shot. */
export const wizardOnboardingInputSchema = z.object({
	brandId: z.string().min(1),
	brandName: z.string().min(1).optional(),
	website: z.string().min(1).optional(),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
});

/** Internal shape for createBrand — matches storage (website + additionalDomains). */
export interface CreateBrandInput {
	id: string;
	name: string;
	website: string;
	additionalDomains?: string[];
	aliases?: string[];
	competitors?: CompetitorInput[];
	prompts?: PromptInput[];
	/**
	 * The workspace that will own — and be billed for — the brand. Null keeps
	 * the historical behaviour of provisioning one named after the brand id,
	 * which is right for an admin key standing up a whole tenant and wrong for
	 * anyone acting inside a workspace that already exists.
	 */
	organizationId?: string | null;
	/** A transaction the caller is already inside; see createBrand. */
	conn?: DbConnection;
	/**
	 * Runs work once `conn`'s transaction commits. Scheduling is the only thing
	 * here that must not happen inside it — see the call site.
	 */
	afterCommit?: (task: () => Promise<unknown>) => void;
}

/** Internal shape for updateBrand — matches storage. */
export interface UpdateBrandInput {
	brandId: string;
	brandName?: string;
	website?: string;
	additionalDomains?: string[];
	aliases?: string[];
	enabled?: boolean;
}

export type WizardOnboardingInput = z.infer<typeof wizardOnboardingInputSchema>;

export interface BrandResult {
	id: string;
	name: string;
	organizationId: string;
	domains: string[];
	aliases: string[];
	enabled: boolean;
	onboarded: boolean;
	/** Platforms this brand is tracked on. Null means the deployment default. */
	enabledModels: string[] | null;
	/** Sampling cadence override in hours. Null means the plan cadence. */
	delayOverrideHours: number | null;
	createdAt: Date;
	updatedAt: Date;
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

export function buildBrandResult(row: typeof brands.$inferSelect): BrandResult {
	const websiteHost = new URL(row.website).hostname.replace(/^www\./, "");
	return {
		id: row.id,
		name: row.name,
		organizationId: row.organizationId,
		domains: [websiteHost, ...row.additionalDomains],
		aliases: row.aliases,
		enabled: row.enabled,
		onboarded: row.onboarded,
		enabledModels: row.enabledModels,
		delayOverrideHours: row.delayOverrideHours,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/**
 * Validation error thrown by the API → internal converters when the supplied
 * `domains` array contains no valid entries after cleaning. Callers should
 * surface this as a 400.
 */
export class InvalidDomainsError extends Error {
	constructor(message = "domains: at least one valid domain is required") {
		super(message);
		this.name = "InvalidDomainsError";
	}
}

function splitDomainsForStorage(domains: string[]): { website: string; additionalDomains: string[] } {
	const cleaned = dedupeDomains(domains);
	if (cleaned.length === 0) throw new InvalidDomainsError();
	const [primary, ...rest] = cleaned;
	return { website: `https://${primary}`, additionalDomains: rest };
}

/** Convert POST /api/v1/brands body into the internal createBrand input. */
export function apiCreateInputToInternal(input: z.infer<typeof createBrandInputSchema>): CreateBrandInput {
	const { website, additionalDomains } = splitDomainsForStorage(input.domains);
	return {
		id: input.id,
		name: input.name,
		website,
		additionalDomains,
		aliases: input.aliases,
		competitors: input.competitors,
		prompts: input.prompts,
		organizationId: input.organizationId ?? null,
	};
}

/** Convert PATCH /api/v1/brands/:brandId body into the internal updateBrand input. */
export function apiUpdateInputToInternal(
	brandId: string,
	input: z.infer<typeof updateBrandBodySchema>,
): UpdateBrandInput {
	const result: UpdateBrandInput = {
		brandId,
		brandName: input.brandName,
		aliases: input.aliases,
		enabled: input.enabled,
	};
	if (input.domains !== undefined) {
		const { website, additionalDomains } = splitDomainsForStorage(input.domains);
		result.website = website;
		result.additionalDomains = additionalDomains;
	}
	return result;
}

async function insertCompetitors(args: {
	brandId: string;
	websiteHost: string;
	source: { name: string; domains: string[]; aliases: string[] }[];
	conn?: DbConnection;
}): Promise<number> {
	if (args.source.length === 0) return 0;
	const conn = args.conn ?? db;

	const existing = await conn.query.competitors.findMany({
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

	await assertCompetitorCap(args.brandId, toInsert.length, conn);

	await conn.insert(competitors).values(toInsert);
	return toInsert.length;
}

async function insertPrompts(args: {
	brandId: string;
	brandName: string;
	website: string;
	source: { value: string; tags: string[]; enabled: boolean }[];
	dedupeAgainstExisting: boolean;
	conn?: DbConnection;
	/**
	 * Supplied when the brand row is still uncommitted in `conn`'s transaction:
	 * looking it up would use a different connection and find nothing.
	 */
	organizationId?: string;
}): Promise<string[]> {
	if (args.source.length === 0) return [];
	const conn = args.conn ?? db;

	const seen = new Set<string>();
	if (args.dedupeAgainstExisting) {
		const existing = await conn.query.prompts.findMany({
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
	if (rows.length === 0) return [];

	// Covers both wizard onboarding and POST /api/v1/brands — the two bulk
	// prompt-creation surfaces share this chokepoint.
	const organizationId = args.organizationId ?? (await getBrandOrganizationId(args.brandId));
	await assertCanAddPrompts(organizationId, rows.filter((r) => r.enabled).length, args.conn);

	const inserted = await conn.insert(prompts).values(rows).returning({ id: prompts.id });
	return inserted.map((r) => r.id);
}

// ============================================================================
// createBrand — pure create
// ============================================================================

export async function createBrand(input: CreateBrandInput): Promise<BrandResult> {
	const formattedWebsite = validateAndFormatWebsite(input.website);
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");

	const additionalDomains = dedupeDomains(input.additionalDomains ?? []).filter((d) => d !== websiteHost);
	const aliases = dedupeAliases(input.aliases ?? []);

	// Brands are hard-scoped to an org via a NOT NULL FK. The admin API uses the
	// supplied id for both records, so materialize the org first. This is a no-op
	// when an earlier call already created it.
	//
	// The whole aggregate shares one transaction. A brand that exists with none
	// of its prompts is worse than no brand at all: the caller gets an error but
	// retrying hits BrandConflictError, so there is no way back to a good state.
	const organizationId = input.organizationId ?? input.id;
	const write = async (tx: DbConnection) => {
		// Only provision a workspace when the caller didn't name one. Naming an
		// existing one is how a brand joins a tenant that is already being billed.
		if (!input.organizationId) {
			await ensureOrganization({ id: input.id, name: input.name }, tx);
		}
		const slug = await findUnusedBrandSlug(organizationId, slugify(input.name, "brand"), tx);

		const [inserted] = await tx
			.insert(brands)
			.values({
				id: input.id,
				organizationId,
				name: input.name,
				slug,
				website: formattedWebsite,
				additionalDomains,
				aliases,
				enabled: true,
				onboarded: true,
			})
			.onConflictDoNothing({ target: brands.id })
			.returning({ id: brands.id });
		if (!inserted) throw new BrandConflictError(input.id);

		await insertCompetitors({
			brandId: input.id,
			websiteHost,
			source: (input.competitors ?? []).map((c) => ({
				name: c.name,
				domains: c.domains ?? [],
				aliases: c.aliases ?? [],
			})),
			conn: tx,
		});

		return await insertPrompts({
			brandId: input.id,
			brandName: input.name,
			website: formattedWebsite,
			source: (input.prompts ?? []).map((p) => ({
				value: p.value,
				tags: sanitizeUserTags(p.tags ?? []),
				enabled: p.enabled ?? true,
			})),
			dedupeAgainstExisting: false,
			conn: tx,
			organizationId,
		});
	};
	// Reuse the caller's transaction when there is one. Opening a second here
	// would hold theirs open while waiting on another pooled connection.
	const promptIds = input.conn ? await write(input.conn) : await claimNewBrandSlug(() => db.transaction(write));

	// A scheduler for a prompt the transaction rolled back would outlive the
	// prompt itself, and it queries through the pool — which would strand this
	// transaction waiting on a second connection. So it waits for the commit,
	// whether that is ours or the caller's.
	const schedule = () => createMultiplePromptJobSchedulers(promptIds);
	if (input.afterCommit) input.afterCommit(schedule);
	else await schedule();

	const refreshed = await (input.conn ?? db).query.brands.findFirst({ where: eq(brands.id, input.id) });
	return buildBrandResult(refreshed!);
}

// ============================================================================
// updateBrand — pure brand-level update
// ============================================================================

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

export async function saveWizardOnboarding(input: WizardOnboardingInput): Promise<BrandResult> {
	await updateBrand({
		brandId: input.brandId,
		brandName: input.brandName,
		website: input.website,
		additionalDomains: input.additionalDomains,
		aliases: input.aliases,
	});

	await db.update(brands).set({ onboarded: true, updatedAt: new Date() }).where(eq(brands.id, input.brandId));

	const existing = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!existing) throw new BrandNotFoundError(input.brandId);
	const websiteHost = new URL(existing.website).hostname.replace(/^www\./, "");

	await insertCompetitors({
		brandId: input.brandId,
		websiteHost,
		source: (input.competitors ?? []).map((c) => ({
			name: c.name,
			domains: c.domains ?? [],
			aliases: c.aliases ?? [],
		})),
	});

	const wizardPromptIds = await insertPrompts({
		brandId: input.brandId,
		brandName: existing.name,
		website: existing.website,
		source: (input.prompts ?? []).map((p) => ({
			value: p.value,
			tags: sanitizeUserTags(p.tags ?? []),
			enabled: p.enabled ?? true,
		})),
		dedupeAgainstExisting: true,
	});
	await createMultiplePromptJobSchedulers(wizardPromptIds);

	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	return buildBrandResult(refreshed!);
}

// ============================================================================
// Reads
// ============================================================================

export interface ListBrandsFilters {
	/** Omit both to read the whole scope; a caller that pages passes them together. */
	limit?: number;
	offset?: number;
	/** The caller's tenancy condition, from `brandScopeCondition`. */
	scope?: SQL;
}

/**
 * The brand list both external surfaces publish, already shaped by
 * `buildBrandResult`. Tenancy is the caller's job; nothing here knows who is
 * asking.
 */
export async function listBrands(filters: ListBrandsFilters): Promise<{ data: BrandResult[]; total: number }> {
	const where = filters.scope;
	const [totals] = await db.select({ count: count() }).from(brands).where(where);
	let query = db.select().from(brands).where(where).orderBy(desc(brands.createdAt)).$dynamic();
	if (filters.limit !== undefined) query = query.limit(filters.limit).offset(filters.offset ?? 0);
	const rows = await query;

	return { data: rows.map(buildBrandResult), total: totals?.count ?? 0 };
}
