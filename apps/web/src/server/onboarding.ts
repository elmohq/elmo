/**
 * Server functions for the onboarding wizard + brand analysis.
 *
 * This file ONLY exports createServerFn server functions. No regular function
 * exports, no class exports, no db imports. TanStack Start replaces server
 * functions with lightweight RPC stubs on the client — but only if the module
 * doesn't drag in server-only dependencies (db, drizzle, pg) via other
 * exports. Keeping this file server-fn-only guarantees the client bundle
 * stays clean.
 *
 * Regular functions (createBrand, updateBrand, etc.) live in
 * ./onboarding-core.ts, imported only by API routes (server-only).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { saveWizardOnboarding, wizardOnboardingInputSchema } from "@/server/onboarding-core";

/** Run brand analysis without saving anything. */
export const analyzeBrandFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			website: z.string().min(1),
			brandName: z.string().optional(),
			maxCompetitors: z.number().int().min(0).optional(),
			maxPrompts: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireAuthSession();
		return analyzeBrand({
			website: data.website,
			brandName: data.brandName,
			maxCompetitors: data.maxCompetitors,
			maxPrompts: data.maxPrompts,
		});
	});

/**
 * Persist the wizard's reviewed onboarding result for a brand the user
 * already has access to.
 */
export const updateOnboardedBrandFn = createServerFn({ method: "POST" })
	.inputValidator(wizardOnboardingInputSchema)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		return saveWizardOnboarding(data);
	});
