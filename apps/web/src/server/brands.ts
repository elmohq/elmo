/**
 * Server functions for brand operations.
 * Replaces apps/web/src/app/api/brands/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDefaultDelayHours, MAX_COMPETITORS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { findUniqueBrandId, slugify } from "@workspace/lib/db/provisioning";
import { type Brand, type BrandWithPrompts, brands, competitors, prompts } from "@workspace/lib/db/schema";
import {
	assertCanCreateBrand,
	assertEnabledModelsAllowed,
	type Entitlements,
	getOrgEntitlements,
	getOrgEntitlementsMap,
} from "@workspace/lib/entitlements";
import type { ModelConfig } from "@workspace/lib/providers";
import {
	isGroundedApiTarget,
	parseScrapeTargets,
	resolveProviderAccess,
	selectTargetsForBrand,
} from "@workspace/lib/providers";
import { defaultPlatformPicks, resolvePromptRunPlan } from "@workspace/lib/run-policy";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { listUserOrganizations, requireAuthSession, requireBrandAccess, requireOrgAccess } from "@/lib/auth/helpers";
import { evaluateRequireCanCreateBrands, resolveBrandOrganization } from "@/lib/auth/policies";
import { normalizeBrandUpdate } from "@/lib/brand-settings";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { getDeployment } from "@/lib/config/server";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { type TrackedTarget, targetFilterValue } from "@/lib/model-filter";

const BRAND_ORG_ERRORS = {
	"no-organization": "No organization for the current user",
	forbidden: "Forbidden: No access to this organization",
	ambiguous: "Choose a workspace for this brand",
} as const;

/**
 * What this brand's results can be broken down by: the standard platforms it
 * picks, plus the grounded variants its prompts are tracked on.
 *
 * A model can appear twice — scraped and grounded are different answers to
 * different questions — so these are targets rather than model ids. Anything
 * asking "which models is this brand tracking?" reads from here; deployments
 * configure arbitrary sets via `SCRAPE_TARGETS`, so nothing hardcodes a list.
 */
function computeTrackedTargets(
	brand: Brand,
	brandPrompts: { premiumModels: string[] }[],
	entitlements: Entitlements,
): TrackedTarget[] {
	try {
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

		// Ask the run policy rather than re-deriving it: it already decides which
		// targets a brand runs, how often, and how many times per firing, and a
		// second copy of that arithmetic here is how the page and the worker
		// started disagreeing in the first place. Grounded targets are assigned
		// per prompt, so the brand's set is the union across its prompts.
		const plan = resolvePromptRunPlan({
			scrapeTargets: configs,
			brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
			prompt: { premiumModels: [...new Set(brandPrompts.flatMap((prompt) => prompt.premiumModels))] },
			entitlements,
			defaultDelayHours: getDefaultDelayHours(),
		});

		return plan.targets.map((target) => {
			const premium = isGroundedApiTarget(target.config);
			return {
				value: targetFilterValue(target.config.model, premium),
				model: target.config.model,
				premium,
				// Scraped surface, bare API call, or grounded one — the same split the
				// LLM settings page groups by, resolved from the target rather than
				// guessed from the model id (a model can be reached either way).
				tier: premium
					? ("premium" as const)
					: resolveProviderAccess(target.config) === "scraped"
						? ("scraped" as const)
						: ("api" as const),
				intervalHours: target.intervalHours,
				replication: target.replication,
			};
		});
	} catch {
		// A misconfigured SCRAPE_TARGETS would already be surfacing via
		// `validateScrapeTargets` at boot; here we'd rather degrade to an empty
		// list than crash the brand fetch.
		return [];
	}
}

/**
 * Cloud brands start with their plan's default platform picks written
 * explicitly, so the run policy, the model filter, and the LLMs settings page
 * all agree from the first run. Outside cloud (or when nothing is pickable
 * yet, e.g. an unsubscribed org via the admin API) brands keep the null
 * "follow deployment configuration" semantics.
 *
 * Note: the defaults written here are a snapshot at creation time. The
 * run policy's `resolvePromptRunPlan` also applies `defaultPlatformPicks` as a
 * fallback when `brand.enabledModels` is null — so a brand that had picks
 * written explicitly follows the creation-time snapshot, while one created
 * via the API without picks always resolves fresh defaults. Both converge for
 * the same plan; the dual path is intentional defense-in-depth.
 */
async function initialEnabledModels(organizationId: string): Promise<string[] | null> {
	if (getDeployment().mode !== "cloud") return null;
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return null;
	const picks = defaultPlatformPicks(entitlements, parseScrapeTargets(process.env.SCRAPE_TARGETS));
	return picks.length > 0 ? picks : null;
}

/**
 * Picks supplied at creation time go through the same checks as a
 * post-creation edit: the loud configured-target validation plus plan
 * enforcement. Without picks, creation falls back to the plan defaults.
 */
async function resolveCreateEnabledModels(
	organizationId: string,
	requested: string[] | undefined,
): Promise<string[] | null> {
	if (!requested || requested.length === 0) return initialEnabledModels(organizationId);
	const models = [...new Set(requested)];
	selectTargetsForBrand(parseScrapeTargets(process.env.SCRAPE_TARGETS), models);
	await assertEnabledModelsAllowed(organizationId, models);
	return models;
}

function getDefaultBrandDomains(): string[] {
	const raw = process.env.DEFAULT_BRAND_DOMAINS;
	if (!raw) return [];
	return raw
		.split(",")
		.map((d) => d.trim())
		.filter(Boolean)
		.map((d) => cleanAndValidateDomain(d))
		.filter((d): d is string => d !== null);
}

// ============================================================================
// Helper functions (migrated from apps/web/src/lib/metadata.ts)
// ============================================================================

/**
 * Entitlements come in from the caller rather than being loaded here: the
 * brand-list path fans this out per brand, and resolving them inside would put
 * two subscription queries on every brand a whitelabel org owns.
 */
async function getBrandWithPromptsFromDb(
	brandId: string,
	entitlements?: Entitlements,
): Promise<(BrandWithPrompts & { trackedTargets: TrackedTarget[] }) | undefined> {
	try {
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});
		if (!brand) return undefined;

		const [brandPrompts, brandCompetitors, resolved] = await Promise.all([
			db.query.prompts.findMany({ where: eq(prompts.brandId, brandId) }),
			db.query.competitors.findMany({ where: eq(competitors.brandId, brandId) }),
			entitlements ?? getOrgEntitlements(brand.organizationId),
		]);

		return {
			...brand,
			prompts: brandPrompts,
			competitors: brandCompetitors,
			trackedTargets: computeTrackedTargets(brand, brandPrompts, resolved),
		};
	} catch (error) {
		console.error("Error fetching brand with prompts:", error);
		return undefined;
	}
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get all brands the current user has access to.
 *
 * Org scoping is the access-control mechanism: we resolve the orgs the user is
 * a member of and return only brands owned by those orgs (`brands.organization_id
 * IN (...)`). A user in org A never sees org B's brands.
 */
export const getBrands = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireAuthSession();
	const userOrgs = await listUserOrganizations(session.user.id);
	const orgIds = userOrgs.map((o) => o.id);

	if (orgIds.length === 0) {
		return [];
	}

	const scopedBrands = await db.query.brands.findMany({
		where: inArray(brands.organizationId, orgIds),
	});

	// Every brand needs its org's entitlements to say what it tracks; resolve
	// them for all the orgs at once rather than per brand.
	const entitlementsByOrg = await getOrgEntitlementsMap(orgIds);
	const brandsData = await Promise.all(
		scopedBrands.map((brand) => getBrandWithPromptsFromDb(brand.id, entitlementsByOrg.get(brand.organizationId))),
	);

	return brandsData.filter(
		(brand): brand is BrandWithPrompts & { trackedTargets: TrackedTarget[] } => brand !== undefined,
	);
});

/**
 * Get a single brand by ID
 */
export const getBrand = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const brand = await getBrandWithPromptsFromDb(data.brandId);
		if (!brand) {
			throw new Error("Brand not found");
		}

		return brand;
	});

/**
 * Create a new brand
 */
export const createBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			brandName: z.string(),
			website: z.string(),
			/** Platform picks from the onboarding wizard; omitted → plan defaults. */
			enabledModels: z.array(z.string().min(1)).max(50).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		// This legacy path fills an empty org's first brand (brandId here IS the
		// org id), so the brand count gate applies to that org.
		await assertCanCreateBrand(data.brandId);

		const urlValidation = validateWebsiteUrl(data.website);
		if (!urlValidation.isValid) {
			throw new Error(urlValidation.error);
		}

		const defaultDomains = getDefaultBrandDomains();
		const enabledModels = await resolveCreateEnabledModels(data.brandId, data.enabledModels);

		const result = await db
			.insert(brands)
			.values({
				id: data.brandId,
				// brandId is the org id from the URL (access verified above); the
				// brand belongs to that org.
				organizationId: data.brandId,
				name: data.brandName,
				website: urlValidation.formattedUrl,
				enabled: true,
				...(enabledModels && { enabledModels }),
				...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
			})
			.onConflictDoNothing()
			.returning();

		const brand =
			result[0] ??
			(await db.query.brands.findFirst({
				where: eq(brands.id, data.brandId),
			}));

		if (!brand) {
			throw new Error("Failed to create brand");
		}

		return { success: true, brand };
	});

/**
 * Attach a new brand to the current user's existing organization, with a
 * fresh id decoupled from the org id. Used by the multi-brand "create new
 * brand" flow on the brand switcher. Gated by the canCreateBrands deployment
 * feature so whitelabel (orgs come from Auth0) and demo (read-only) reject it.
 */
export const createBrandInOrgFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandName: z.string().min(1).max(100),
			website: z.string().min(1),
			organizationId: z.string().optional(),
			/** Platform picks from the creation wizard; omitted → plan defaults. */
			enabledModels: z.array(z.string().min(1)).max(50).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const deployment = getDeployment();

		if (evaluateRequireCanCreateBrands(deployment.features.canCreateBrands) === "deny") {
			throw new Error("Brand creation is not allowed in this deployment");
		}

		const urlValidation = validateWebsiteUrl(data.website);
		if (!urlValidation.isValid) {
			throw new Error(urlValidation.error);
		}

		const trimmedName = data.brandName.trim();
		if (!trimmedName) {
			throw new Error("Brand name must be a non-empty string");
		}

		// Which workspace owns the brand is only ambiguous when the caller belongs
		// to more than one — a cloud user who accepted a team invite, or a local
		// install from when creating a brand minted an org for it. /app/new asks
		// in that case; picking for them would be a coin flip that decides who
		// can see the brand and, later, who gets billed for it.
		const orgs = await listUserOrganizations(session.user.id);
		const choice = resolveBrandOrganization(
			orgs.map((o) => o.id),
			data.organizationId,
		);
		if (!choice.ok) {
			throw new Error(BRAND_ORG_ERRORS[choice.reason]);
		}
		const orgId = choice.organizationId;
		await assertCanCreateBrand(orgId);

		const brandId = await findUniqueBrandId(slugify(trimmedName));
		const defaultDomains = getDefaultBrandDomains();
		const enabledModels = await resolveCreateEnabledModels(orgId, data.enabledModels);

		await db.insert(brands).values({
			id: brandId,
			organizationId: orgId,
			name: trimmedName,
			website: urlValidation.formattedUrl,
			enabled: true,
			...(enabledModels && { enabledModels }),
			...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
		});

		return { brandId };
	});

/**
 * Update a brand
 */
export const updateBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			name: z.string().optional(),
			website: z.string().optional(),
			additionalDomains: z.array(z.string()).optional(),
			aliases: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const normalized = normalizeBrandUpdate({
			name: data.name,
			website: data.website,
			additionalDomains: data.additionalDomains,
			aliases: data.aliases,
		});
		if (!normalized.ok) {
			throw new Error(normalized.error);
		}
		const updateData = normalized.updates;

		const result = await db
			.update(brands)
			.set({ ...updateData, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning();

		if (!result[0]) {
			throw new Error("Failed to update brand");
		}

		return result[0];
	});

/**
 * Get competitors for a brand
 */
export const getCompetitors = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		return db.query.competitors.findMany({
			where: eq(competitors.brandId, data.brandId),
		});
	});

/**
 * Update competitors for a brand (bulk replace)
 */
export const updateCompetitors = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			competitors: z.array(
				z.object({
					name: z.string(),
					domains: z.array(z.string()).min(1),
					aliases: z.array(z.string()).optional().default([]),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		// Validate and clean domains
		const cleanedCompetitors = data.competitors.map((c) => {
			const cleanedDomains = c.domains.map((d) => cleanAndValidateDomain(d));
			const invalid = c.domains.filter((_, i) => !cleanedDomains[i]);
			if (invalid.length > 0) {
				throw new Error(`Invalid domain(s) for "${c.name}": ${invalid.join(", ")}`);
			}
			return {
				name: c.name,
				domains: cleanedDomains.filter(Boolean) as string[],
				aliases: c.aliases,
			};
		});

		return db.transaction(async (tx) => {
			await tx.delete(competitors).where(eq(competitors.brandId, data.brandId));

			if (cleanedCompetitors.length > 0) {
				await tx.insert(competitors).values(
					cleanedCompetitors.map((c) => ({
						brandId: data.brandId,
						name: c.name,
						domains: c.domains,
						aliases: c.aliases,
					})),
				);
			}

			return tx.query.competitors.findMany({
				where: eq(competitors.brandId, data.brandId),
			});
		});
	});

/**
 * Add an additional domain to the brand itself
 */
export const addDomainToBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);

		const [result] = await db
			.update(brands)
			.set({
				additionalDomains: sql`array_append(${brands.additionalDomains}, ${domain})`,
				updatedAt: new Date(),
			})
			.where(and(eq(brands.id, data.brandId), sql`NOT (${domain} = ANY(${brands.additionalDomains}))`))
			.returning();

		if (result) return result;

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, data.brandId),
		});
		if (!brand) throw new Error("Brand not found");
		return brand;
	});

/**
 * Add a domain to an existing competitor
 */
export const addDomainToCompetitorFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			competitorId: z.string(),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const existing = await db.query.competitors.findFirst({
			where: and(eq(competitors.id, data.competitorId), eq(competitors.brandId, data.brandId)),
		});
		if (!existing) throw new Error("Competitor not found");

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);
		if (existing.domains.includes(domain)) return existing;

		const updatedDomains = [...existing.domains, domain];
		const [result] = await db
			.update(competitors)
			.set({ domains: updatedDomains, updatedAt: new Date() })
			.where(eq(competitors.id, data.competitorId))
			.returning();

		return result;
	});

/**
 * Create a new competitor from a domain
 */
export const createCompetitorFromDomainFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			name: z.string().min(1),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);

		const [currentCount] = await db
			.select({ count: count() })
			.from(competitors)
			.where(eq(competitors.brandId, data.brandId));

		if ((currentCount?.count || 0) >= MAX_COMPETITORS) {
			throw new Error(`Cannot add competitor. Maximum of ${MAX_COMPETITORS} competitors reached.`);
		}

		const [result] = await db
			.insert(competitors)
			.values({
				brandId: data.brandId,
				name: data.name.trim(),
				domains: [domain],
			})
			.returning();

		return result;
	});
