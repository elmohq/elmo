/**
 * Brand-onboarding persistence helpers. Server-only — used by the API routes
 * under /api/v1/brands and by the server functions in ./onboarding.ts.
 *
 * Separated from onboarding.ts so that client components importing server
 * functions don't transitively pull in db/drizzle/pg (which breaks the
 * client bundle). Server functions live in onboarding.ts; everything else
 * lives here.
 */

import { CLAUDE_TRACKING_MODES, trackingTargetKeySchema } from "@workspace/config/plans";
import type { DeploymentMode } from "@workspace/config/types";
import { withOrganizationEntitlementTransaction } from "@workspace/lib/cloud/capacity";
import { saveOrganizationPromptsInTransaction } from "@workspace/lib/cloud/prompt-mutations";
import {
	TrackingSettingsError,
	updateBrandTrackingTargetsInTransaction,
	updateClaudePromptAssignmentsInTransaction,
} from "@workspace/lib/cloud/tracking-settings";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { ensureOrganization } from "@workspace/lib/db/provisioning";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { and, count, eq } from "drizzle-orm";
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

const wizardPromptInputSchema = promptInputSchema.extend({
	clientId: z.string().min(1).max(200).optional(),
});

const wizardCloudTrackingSchema = z.object({
	selections: z.array(
		z.object({
			targetKey: trackingTargetKeySchema,
			requestedCadenceMinutes: z.number().int().positive().nullable().optional(),
		}),
	),
	claudeAssignments: z.array(
		z.object({
			promptClientId: z.string().min(1).max(200),
			mode: z.enum(CLAUDE_TRACKING_MODES),
		}),
	),
});

type CompetitorInput = z.infer<typeof competitorInputSchema>;
type PromptInput = z.infer<typeof promptInputSchema>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbConnection = typeof db | DbTransaction;

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
	prompts: z.array(wizardPromptInputSchema).optional(),
	cloudTracking: wizardCloudTrackingSchema.optional(),
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
	domains: string[];
	aliases: string[];
	enabled: boolean;
	onboarded: boolean;
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
		domains: [websiteHost, ...row.additionalDomains],
		aliases: row.aliases,
		enabled: row.enabled,
		onboarded: row.onboarded,
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

	const existing = await conn.select().from(competitors).where(eq(competitors.brandId, args.brandId));
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

	const [{ count: currentCount }] = await conn
		.select({ count: count() })
		.from(competitors)
		.where(eq(competitors.brandId, args.brandId));
	if ((currentCount || 0) + toInsert.length > MAX_COMPETITORS) {
		throw new Error(
			`Cannot add competitors. Would exceed maximum of ${MAX_COMPETITORS} (currently ${currentCount}, adding ${toInsert.length}).`,
		);
	}

	await conn.insert(competitors).values(toInsert);
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

export async function createBrand(input: CreateBrandInput): Promise<BrandResult> {
	const formattedWebsite = validateAndFormatWebsite(input.website);
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");

	const additionalDomains = dedupeDomains(input.additionalDomains ?? []).filter((d) => d !== websiteHost);
	const aliases = dedupeAliases(input.aliases ?? []);

	// Brands are hard-scoped to an org via a NOT NULL FK. This create path (the
	// admin API) supplies the brand id directly and historically created brands
	// whose id == the org id, so materialize that org first. No-op when it
	// already exists (e.g. a whitelabel org already synced from Auth0).
	await ensureOrganization({ id: input.id, name: input.name });

	const [inserted] = await db
		.insert(brands)
		.values({
			id: input.id,
			organizationId: input.id,
			name: input.name,
			website: formattedWebsite,
			additionalDomains,
			aliases,
			enabled: true,
			onboarded: true,
		})
		.onConflictDoNothing()
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
	});

	await insertPrompts({
		brandId: input.id,
		brandName: input.name,
		website: formattedWebsite,
		source: (input.prompts ?? []).map((p) => ({
			value: p.value,
			tags: sanitizeUserTags(p.tags ?? []),
			enabled: p.enabled ?? true,
		})),
		dedupeAgainstExisting: false,
	});

	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.id) });
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

function normalizedPromptValue(value: string): string {
	return value.trim().toLowerCase();
}

function resolveOnboardingClaudeAssignments(input: {
	assignments: NonNullable<WizardOnboardingInput["cloudTracking"]>["claudeAssignments"];
	submittedPrompts: NonNullable<WizardOnboardingInput["prompts"]>;
	persistedPrompts: (typeof prompts.$inferSelect)[];
}) {
	const submittedByClientId = new Map<string, NonNullable<WizardOnboardingInput["prompts"]>[number]>();
	const submittedValues = new Set<string>();
	for (const prompt of input.submittedPrompts) {
		const valueKey = normalizedPromptValue(prompt.value);
		if (submittedValues.has(valueKey)) {
			throw new TrackingSettingsError("The same onboarding prompt was submitted twice.");
		}
		submittedValues.add(valueKey);
		if (!prompt.clientId) continue;
		if (submittedByClientId.has(prompt.clientId)) {
			throw new TrackingSettingsError(`Prompt client id ${prompt.clientId} was submitted twice.`);
		}
		submittedByClientId.set(prompt.clientId, prompt);
	}

	const persistedByValue = new Map<string, (typeof prompts.$inferSelect)[]>();
	for (const prompt of input.persistedPrompts) {
		const key = normalizedPromptValue(prompt.value);
		persistedByValue.set(key, [...(persistedByValue.get(key) ?? []), prompt]);
	}

	return input.assignments.map((assignment) => {
		const submitted = submittedByClientId.get(assignment.promptClientId);
		if (!submitted?.enabled) {
			throw new TrackingSettingsError("Claude tracking can only be assigned to an enabled onboarding prompt.");
		}
		const matches = persistedByValue.get(normalizedPromptValue(submitted.value)) ?? [];
		if (matches.length !== 1 || !matches[0]?.enabled) {
			throw new TrackingSettingsError("Unable to identify the enabled prompt selected for Claude tracking.");
		}
		return { promptId: matches[0].id, mode: assignment.mode };
	});
}

export async function saveWizardOnboarding(
	input: WizardOnboardingInput,
	context: { mode: DeploymentMode; organizationId: string; createdByUserId?: string },
): Promise<BrandResult> {
	const { brand, promptResult } = await withOrganizationEntitlementTransaction({
		mode: context.mode,
		organizationId: context.organizationId,
		run: async ({ tx, resolved }) => {
			if (context.mode === "cloud" && !input.cloudTracking) {
				throw new TrackingSettingsError("Choose this brand's tracking platforms before completing onboarding.");
			}
			if (context.mode !== "cloud" && input.cloudTracking) {
				throw new TrackingSettingsError("Plan tracking settings are only available in cloud mode.");
			}
			const [existing] = await tx
				.select()
				.from(brands)
				.where(and(eq(brands.id, input.brandId), eq(brands.organizationId, context.organizationId)))
				.limit(1);
			if (!existing) throw new BrandNotFoundError(input.brandId);
			if (input.cloudTracking) {
				if (resolved.mode !== "cloud" || resolved.access !== "allowed") {
					throw new TrackingSettingsError("An active cloud plan is required.");
				}
				await updateBrandTrackingTargetsInTransaction({
					tx,
					resolved,
					organizationId: context.organizationId,
					brandId: input.brandId,
					selections: input.cloudTracking.selections,
					createdByUserId: context.createdByUserId,
				});
			}

			const formattedWebsite = input.website ? validateAndFormatWebsite(input.website) : existing.website;
			const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");
			const now = new Date();
			const [updated] = await tx
				.update(brands)
				.set({
					...(input.brandName !== undefined ? { name: input.brandName } : {}),
					...(input.website !== undefined ? { website: formattedWebsite } : {}),
					...(input.additionalDomains !== undefined
						? { additionalDomains: dedupeDomains(input.additionalDomains).filter((d) => d !== websiteHost) }
						: {}),
					...(input.aliases !== undefined ? { aliases: dedupeAliases(input.aliases) } : {}),
					updatedAt: now,
				})
				.where(and(eq(brands.id, input.brandId), eq(brands.organizationId, context.organizationId)))
				.returning();
			if (!updated) throw new BrandNotFoundError(input.brandId);

			await insertCompetitors({
				brandId: input.brandId,
				websiteHost,
				source: (input.competitors ?? []).map((competitor) => ({
					name: competitor.name,
					domains: competitor.domains ?? [],
					aliases: competitor.aliases ?? [],
				})),
				conn: tx,
			});

			const promptResult = await saveOrganizationPromptsInTransaction({
				tx,
				resolved,
				organizationId: context.organizationId,
				brandId: input.brandId,
				mutations: (input.prompts ?? []).map((prompt) => ({
					value: prompt.value,
					tags: sanitizeUserTags(prompt.tags ?? []),
					enabled: prompt.enabled ?? true,
				})),
				dedupeNewValues: true,
			});
			if (input.cloudTracking) {
				if (resolved.mode !== "cloud" || resolved.access !== "allowed") {
					throw new TrackingSettingsError("An active cloud plan is required.");
				}
				await updateClaudePromptAssignmentsInTransaction({
					tx,
					resolved,
					organizationId: context.organizationId,
					brandId: input.brandId,
					assignments: resolveOnboardingClaudeAssignments({
						assignments: input.cloudTracking.claudeAssignments,
						submittedPrompts: input.prompts ?? [],
						persistedPrompts: promptResult.prompts,
					}),
				});
			}

			const [completed] = await tx
				.update(brands)
				.set({ onboarded: true, updatedAt: new Date() })
				.where(and(eq(brands.id, input.brandId), eq(brands.organizationId, context.organizationId)))
				.returning();
			if (!completed) throw new BrandNotFoundError(input.brandId);
			return { brand: completed, promptResult };
		},
	});
	if (context.mode !== "cloud" && promptResult.activatedPromptIds.length > 0) {
		await createMultiplePromptJobSchedulers(promptResult.activatedPromptIds);
	}

	return buildBrandResult(brand);
}
