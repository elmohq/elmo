/**
 * Provider-agnostic onboarding server functions + the shared "create brand
 * from suggestion" path used by both the in-app wizard and the public
 * `/api/v1/onboarding/*` endpoints.
 *
 * Single LLM round-trip produces brand info, additional domains, aliases,
 * competitors (with their own domains/aliases) and suggested prompts. The
 * caller can either save everything immediately or hand the suggestion back
 * to a UI for review.
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
// Shared types
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
	autoCreateBrand: z.boolean().optional().default(true),
});

export type CreateOnboardedBrandInput = z.infer<typeof createOnboardedBrandInputSchema>;

export interface CreateOnboardedBrandResult {
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
// Pure builder — used by both the server fn and the API route
// ============================================================================

/**
 * Create a brand and its prompts/competitors. Generates anything the caller
 * didn't pass in (competitors and/or prompts) by running `analyzeBrand`. The
 * brand row itself is upserted via `onConflictDoNothing` so this is safe to
 * call repeatedly with the same brandId.
 *
 * Auth + org-access checks are the caller's responsibility — they're enforced
 * at the server-fn / API-route boundary.
 */
export async function createOnboardedBrand(
	input: CreateOnboardedBrandInput,
): Promise<CreateOnboardedBrandResult> {
	const formattedWebsite = validateAndFormatWebsite(input.website);
	const websiteHost = new URL(formattedWebsite).hostname.replace(/^www\./, "");

	const explicitCompetitors = input.competitors ?? [];
	const explicitPrompts = input.prompts ?? [];

	const needsLlm =
		(input.generateCompetitors && explicitCompetitors.length === 0) ||
		(input.generatePrompts && explicitPrompts.length === 0);

	let suggestion: OnboardingSuggestion | null = null;
	if (needsLlm) {
		suggestion = await analyzeBrand({
			website: formattedWebsite,
			brandName: input.brandName,
			includeCompetitors: input.generateCompetitors !== false && explicitCompetitors.length === 0,
			includePrompts: input.generatePrompts !== false && explicitPrompts.length === 0,
		});
	}

	// 1. Brand row — additional domains/aliases come from the caller first,
	//    then anything the LLM surfaced that the caller didn't override.
	const additionalDomains = dedupeDomains([
		...(input.additionalDomains ?? []),
		...(suggestion?.additionalDomains ?? []),
	]).filter((d) => d !== websiteHost);

	const aliases = dedupeAliases([...(input.aliases ?? []), ...(suggestion?.aliases ?? [])]);

	if (input.autoCreateBrand !== false) {
		await db
			.insert(brands)
			.values({
				id: input.brandId,
				name: input.brandName,
				website: formattedWebsite,
				additionalDomains,
				aliases,
				enabled: true,
			})
			.onConflictDoNothing();
	}

	// If brand already exists (or autoCreateBrand=false), apply any new
	// additionalDomains/aliases on top — this lets re-running onboarding
	// enrich an existing record without erasing user-provided extras.
	const existing = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!existing) {
		throw new Error(`Brand ${input.brandId} not found and autoCreateBrand=false`);
	}
	if (additionalDomains.length > 0 || aliases.length > 0) {
		const mergedDomains = dedupeDomains([...existing.additionalDomains, ...additionalDomains]);
		const mergedAliases = dedupeAliases([...existing.aliases, ...aliases]);
		if (
			mergedDomains.length !== existing.additionalDomains.length ||
			mergedAliases.length !== existing.aliases.length
		) {
			await db
				.update(brands)
				.set({ additionalDomains: mergedDomains, aliases: mergedAliases, updatedAt: new Date() })
				.where(eq(brands.id, input.brandId));
		}
	}

	// 2. Competitors — caller-provided take precedence; otherwise use the
	//    LLM suggestion. We treat existing rows as the source of truth and
	//    only insert net-new entries (deduped by primary domain).
	const competitorsToInsert: Array<{
		brandId: string;
		name: string;
		domains: string[];
		aliases: string[];
	}> = [];

	const sourceCompetitors =
		explicitCompetitors.length > 0
			? explicitCompetitors.map((c) => ({
					name: c.name,
					domains: c.domains ?? [],
					aliases: c.aliases ?? [],
				}))
			: (suggestion?.competitors ?? []).map((c) => ({
					name: c.name,
					domains: [c.domain, ...c.additionalDomains],
					aliases: c.aliases,
				}));

	if (sourceCompetitors.length > 0) {
		const existingCompetitors = await db.query.competitors.findMany({
			where: eq(competitors.brandId, input.brandId),
		});
		const existingPrimaryDomains = new Set(existingCompetitors.flatMap((c) => c.domains));

		for (const c of sourceCompetitors) {
			const cleaned = dedupeDomains(c.domains).filter((d) => d !== websiteHost);
			if (cleaned.length === 0) continue;
			if (cleaned.some((d) => existingPrimaryDomains.has(d))) continue;
			competitorsToInsert.push({
				brandId: input.brandId,
				name: c.name.trim(),
				domains: cleaned,
				aliases: dedupeAliases(c.aliases),
			});
		}

		const [{ count: currentCount }] = await db
			.select({ count: count() })
			.from(competitors)
			.where(eq(competitors.brandId, input.brandId));

		if ((currentCount || 0) + competitorsToInsert.length > MAX_COMPETITORS) {
			throw new Error(
				`Cannot add competitors. Would exceed maximum of ${MAX_COMPETITORS} (currently ${currentCount}, adding ${competitorsToInsert.length}).`,
			);
		}
	}

	let competitorsCreated = 0;
	if (competitorsToInsert.length > 0) {
		await db.insert(competitors).values(competitorsToInsert);
		competitorsCreated = competitorsToInsert.length;
	}

	// 3. Prompts — caller-provided plus suggestion (deduped by lowercased
	//    value, only against rows we're inserting now).
	const seenPromptValues = new Set<string>();
	const promptRows: Array<{
		brandId: string;
		value: string;
		enabled: boolean;
		tags: string[];
		systemTags: string[];
	}> = [];

	const explicit = explicitPrompts.map((p) => ({
		value: p.value.trim(),
		tags: sanitizeUserTags(p.tags ?? []),
		enabled: p.enabled ?? true,
	}));
	const generated = (suggestion?.suggestedPrompts ?? []).map((p) => ({
		value: p.prompt.trim(),
		tags: sanitizeUserTags(p.tags ?? []),
		enabled: true,
	}));

	for (const p of [...explicit, ...generated]) {
		const value = p.value;
		if (!value) continue;
		const key = value.toLowerCase();
		if (seenPromptValues.has(key)) continue;
		seenPromptValues.add(key);
		promptRows.push({
			brandId: input.brandId,
			value,
			enabled: p.enabled,
			tags: p.tags,
			systemTags: computeSystemTags(value, input.brandName, formattedWebsite),
		});
	}

	let promptsCreated = 0;
	if (promptRows.length > 0) {
		const inserted = await db.insert(prompts).values(promptRows).returning({ id: prompts.id });
		promptsCreated = inserted.length;
		await createMultiplePromptJobSchedulers(inserted.map((r) => r.id));
	}

	// Mark onboarded so the dashboard skips the wizard on next load.
	await db.update(brands).set({ onboarded: true, updatedAt: new Date() }).where(eq(brands.id, input.brandId));

	const refreshed = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });

	return {
		brandId: input.brandId,
		brandName: refreshed?.name ?? input.brandName,
		website: refreshed?.website ?? formattedWebsite,
		additionalDomains: refreshed?.additionalDomains ?? additionalDomains,
		aliases: refreshed?.aliases ?? aliases,
		promptsCreated,
		competitorsCreated,
		suggestion,
	};
}

// ============================================================================
// Server functions (in-app wizard)
// ============================================================================

/**
 * Run brand analysis without saving anything. The caller decides what to
 * keep before invoking `createOnboardedBrandFn`.
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
 * Persist the onboarding result for a brand the user already has access to.
 */
export const createOnboardedBrandFn = createServerFn({ method: "POST" })
	.inputValidator(createOnboardedBrandInputSchema)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		return createOnboardedBrand(data);
	});

export { createOnboardedBrandInputSchema };
