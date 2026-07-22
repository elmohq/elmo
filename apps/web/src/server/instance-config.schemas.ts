/**
 * Zod schemas + inferred input types for the instance-config server functions.
 * Pure (zod only, no server-only imports), so the wrapper module can use them in
 * `.validator()` and the `.server` impl module can `z.infer` its argument types
 * from the same source — one definition per shape, no hand-kept interfaces and
 * no wrapper↔impl type import.
 */
import { z } from "zod";

const requiredEntitlement = z.enum(["webSearchApiTargets", "custom"]).nullish();

export const modelTargetCreateSchema = z.object({
	model: z.string().trim().min(1),
	provider: z.string().trim().min(1),
	version: z.string().trim().min(1).nullish(),
	webSearch: z.boolean().default(false),
	enabled: z.boolean().default(true),
	priority: z.number().int().default(0),
	requiredEntitlement,
});

export const modelTargetUpdateSchema = z.object({
	id: z.string().min(1),
	model: z.string().trim().min(1).optional(),
	provider: z.string().trim().min(1).optional(),
	version: z.string().trim().min(1).nullish(),
	webSearch: z.boolean().optional(),
	enabled: z.boolean().optional(),
	priority: z.number().int().optional(),
	requiredEntitlement,
});

export const modelTargetIdSchema = z.object({ id: z.string().min(1) });

export const upsertProviderCredentialSchema = z.object({
	provider: z.string().trim().min(1),
	values: z.record(z.string(), z.string().min(1)),
});

export const providerSchema = z.object({ provider: z.string().trim().min(1) });

export const organizationIdSchema = z.object({ organizationId: z.string().min(1) });

export const entitlementOverridesSchema = z
	.object({
		maxBrands: z.number().int().min(0).nullable().optional(),
		maxPromptsPerOrg: z.number().int().min(0).nullable().optional(),
		maxCompetitorsPerBrand: z.number().int().min(0).nullable().optional(),
		standardModelPicks: z.number().int().min(0).nullable().optional(),
		standardModelMenu: z.array(z.string()).nullable().optional(),
		claudePromptPool: z.number().int().min(0).optional(),
		maxRunsPerDay: z.record(z.string(), z.number().min(0)).nullable().optional(),
		allowWebSearchApiTargets: z.boolean().optional(),
		allowCustomTargets: z.boolean().optional(),
	})
	.strict();

export const setOrganizationSettingsSchema = z.object({
	organizationId: z.string().min(1),
	planKey: z.string().nullable(),
	entitlementOverrides: entitlementOverridesSchema.nullable(),
});

export type ModelTargetInput = z.infer<typeof modelTargetCreateSchema>;
export type ModelTargetUpdateInput = z.infer<typeof modelTargetUpdateSchema>;
export type UpsertProviderCredentialInput = z.infer<typeof upsertProviderCredentialSchema>;
export type ProviderInput = z.infer<typeof providerSchema>;
export type OrganizationIdInput = z.infer<typeof organizationIdSchema>;
export type EntitlementOverridesInput = z.infer<typeof entitlementOverridesSchema>;
export type SetOrganizationSettingsInput = z.infer<typeof setOrganizationSettingsSchema>;
