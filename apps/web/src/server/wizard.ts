/**
 * Server functions for the onboarding wizard.
 * Replaces apps/web/src/app/api/wizard/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { prompts, competitors, brands } from "@workspace/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import {
	analyzeWebsite,
	getCompetitors,
	getKeywords,
	getPersonas,
	createPromptsData,
} from "@workspace/lib/wizard-helpers";

const MAX_PERSONA_GROUP_MEMBERS = 4;

/**
 * Analyze a website to extract products and business info
 */
export const analyzeWebsiteFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ website: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireAuthSession();
		return analyzeWebsite(data.website);
	});

/**
 * Get competitor suggestions based on products and website
 */
export const getCompetitorsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			products: z.array(z.string()).min(1),
			website: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		await requireAuthSession();
		const result = await getCompetitors(data.products, data.website);
		return { competitors: result };
	});

/**
 * Get keyword suggestions based on domain and products
 */
export const getKeywordsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			domain: z.string().min(1),
			products: z.array(z.string()).min(1),
		}),
	)
	.handler(async ({ data }) => {
		await requireAuthSession();
		const result = await getKeywords(data.domain, data.products);
		return { keywords: result };
	});

/**
 * Get persona group suggestions based on products and website
 */
export const getPersonasFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			products: z.array(z.string()).min(1),
			website: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		await requireAuthSession();
		const result = await getPersonas(data.products, data.website);
		return { personaGroups: result };
	});

/**
 * Create prompts, competitors, and job schedulers for a brand
 */
export const createPromptsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			competitors: z
				.array(z.object({
					name: z.string(),
					domain: z.string().optional(),
					extraDomains: z.array(z.string()).optional(),
					aliases: z.array(z.string()).optional(),
				}))
				.optional()
				.default([]),
			personaGroups: z
				.array(
					z.object({
						name: z.string(),
						personas: z.array(z.object({ name: z.string() })),
					}),
				)
				.optional()
				.default([]),
			keywords: z.array(z.string()).optional().default([]),
			customPrompts: z.array(z.string()).optional().default([]),
			products: z.array(z.string()).optional().default([]),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		// Validate persona groups
		for (const group of data.personaGroups) {
			if (group.personas.length > MAX_PERSONA_GROUP_MEMBERS) {
				throw new Error(
					`Persona group "${group.name}" has too many members. Maximum: ${MAX_PERSONA_GROUP_MEMBERS}`,
				);
			}
		}

		if (data.competitors.length > MAX_COMPETITORS) {
			throw new Error(`Too many competitors. Maximum: ${MAX_COMPETITORS}`);
		}

		// Get brand info
		const brandInfo = await db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1);
		if (brandInfo.length === 0) throw new Error("Brand not found");
		const brand = brandInfo[0];

		// Check current competitor count
		const [currentCompCount] = await db
			.select({ count: count() })
			.from(competitors)
			.where(eq(competitors.brandId, data.brandId));

		const currentCompetitorCount = currentCompCount?.count || 0;

		// Create prompts data — transform zod-validated inputs to match helper types
		const { prompts: promptsToCreate, competitors: competitorsFromHelper } = createPromptsData({
			brandId: data.brandId,
			brandName: brand.name,
			brandWebsite: brand.website,
			products: data.products,
			competitors: data.competitors.map((c) => ({ name: c.name, domain: c.domain ?? "" })),
			personaGroups: data.personaGroups.map((g) => ({ name: g.name, personas: g.personas.map((p) => p.name) })),
			keywords: data.keywords.map((k) => ({ keyword: k, search_volume: 0, difficulty: 0 })),
			customPrompts: data.customPrompts,
		});

		// Build a lookup from the original input to get extraDomains/aliases
		const inputByName = new Map(data.competitors.map((c) => [c.name, c]));

		const competitorsToCreate = competitorsFromHelper.map((c) => {
			const input = inputByName.get(c.name);
			const rawExtraDomains = (input?.extraDomains || []).map((d) => d.trim()).filter(Boolean);
			const validatedExtra = rawExtraDomains.map((d) => cleanAndValidateDomain(d)).filter(Boolean) as string[];
			const aliases = (input?.aliases || []).map((a) => a.trim()).filter(Boolean);
			return {
				brandId: data.brandId,
				name: c.name,
				domains: [c.domain || "", ...validatedExtra].filter(Boolean),
				aliases,
			};
		});

		if (currentCompetitorCount + competitorsToCreate.length > MAX_COMPETITORS) {
			throw new Error(`Cannot create competitors. Would exceed maximum of ${MAX_COMPETITORS}.`);
		}

		// Insert
		let promptsCreated = 0;
		let competitorsCreated = 0;
		let jobSchedulersCreated = 0;
		const createdPromptIds: string[] = [];

		if (promptsToCreate.length > 0) {
			const inserted = await db.insert(prompts).values(promptsToCreate).returning({ id: prompts.id });
			promptsCreated = inserted.length;
			createdPromptIds.push(...inserted.map((p) => p.id));
		}

		if (competitorsToCreate.length > 0) {
			await db.insert(competitors).values(competitorsToCreate);
			competitorsCreated = competitorsToCreate.length;
		}

		if (createdPromptIds.length > 0) {
			const results = await createMultiplePromptJobSchedulers(createdPromptIds);
			jobSchedulersCreated = results.filter(Boolean).length;
		}

		await db.update(brands).set({ onboarded: true }).where(eq(brands.id, data.brandId));

		return { success: true, promptsCreated, competitorsCreated, jobSchedulersCreated };
	});

/**
 * Skip onboarding for a brand
 */
export const skipOnboardingFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		await db.update(brands).set({ onboarded: true }).where(eq(brands.id, data.brandId));
		return { success: true };
	});
