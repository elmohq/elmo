/**
 * Server functions for the three non-cascading config entity tables (§3b):
 * the model-target catalog, provider credentials, and organization settings
 * (entitlements). The implementations live in `./instance-config.server` so
 * this module carries no server-only imports outside the handler bodies.
 *
 * Write gates and credential-safety notes live with the impls.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	createModelTargetImpl,
	deleteModelTargetImpl,
	deleteProviderCredentialImpl,
	getOrganizationSettingsImpl,
	listModelTargetsImpl,
	listProviderCredentialsImpl,
	requireInstanceAdminRead,
	setOrganizationSettingsImpl,
	updateModelTargetImpl,
	upsertProviderCredentialImpl,
	verifyProviderCredentialImpl,
} from "./instance-config.server";

// ============================================================================
// Model targets (the catalog)
// ============================================================================

export const listModelTargetsFn = createServerFn({ method: "GET" }).handler(() => listModelTargetsImpl());

export const createModelTargetFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			model: z.string().trim().min(1),
			provider: z.string().trim().min(1),
			version: z.string().trim().min(1).nullish(),
			webSearch: z.boolean().default(false),
			enabled: z.boolean().default(true),
			priority: z.number().int().default(0),
			requiredEntitlement: z.enum(["webSearchApiTargets", "custom"]).nullish(),
		}),
	)
	.handler(({ data }) => createModelTargetImpl(data));

export const updateModelTargetFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().min(1),
			model: z.string().trim().min(1).optional(),
			provider: z.string().trim().min(1).optional(),
			version: z.string().trim().min(1).nullish(),
			webSearch: z.boolean().optional(),
			enabled: z.boolean().optional(),
			priority: z.number().int().optional(),
			requiredEntitlement: z.enum(["webSearchApiTargets", "custom"]).nullish(),
		}),
	)
	.handler(({ data }) => updateModelTargetImpl(data));

export const deleteModelTargetFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().min(1) }))
	.handler(({ data }) => deleteModelTargetImpl(data));

// ============================================================================
// Provider credentials
// ============================================================================

export const listProviderCredentialsFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireInstanceAdminRead();
	return listProviderCredentialsImpl();
});

export const upsertProviderCredentialFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			provider: z.string().trim().min(1),
			values: z.record(z.string(), z.string().min(1)),
		}),
	)
	.handler(({ data }) => upsertProviderCredentialImpl(data));

export const deleteProviderCredentialFn = createServerFn({ method: "POST" })
	.validator(z.object({ provider: z.string().trim().min(1) }))
	.handler(({ data }) => deleteProviderCredentialImpl(data));

export const verifyProviderCredentialFn = createServerFn({ method: "POST" })
	.validator(z.object({ provider: z.string().trim().min(1) }))
	.handler(({ data }) => verifyProviderCredentialImpl(data));

// ============================================================================
// Organization settings (entitlements) — staff-only
// ============================================================================

const entitlementOverridesSchema = z
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

/** The impl (`./instance-config.server`) reuses this exact inferred shape. */
export type EntitlementOverridesInput = z.infer<typeof entitlementOverridesSchema>;

export const getOrganizationSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string().min(1) }))
	.handler(({ data }) => getOrganizationSettingsImpl(data));

export const setOrganizationSettingsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string().min(1),
			planKey: z.string().nullable(),
			entitlementOverrides: entitlementOverridesSchema.nullable(),
		}),
	)
	.handler(({ data }) => setOrganizationSettingsImpl(data));
