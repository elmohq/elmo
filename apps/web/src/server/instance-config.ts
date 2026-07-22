/**
 * Server functions for the three non-cascading config entity tables (§3b):
 * the model-target catalog, provider credentials, and organization settings
 * (entitlements). The implementations live in `./instance-config.server` so
 * this module carries no server-only imports outside the handler bodies; the
 * validators and their inferred types live in `./instance-config.schemas`.
 *
 * Write gates and credential-safety notes live with the impls.
 */
import { createServerFn } from "@tanstack/react-start";
import {
	modelTargetCreateSchema,
	modelTargetIdSchema,
	modelTargetUpdateSchema,
	organizationIdSchema,
	providerSchema,
	setOrganizationSettingsSchema,
	upsertProviderCredentialSchema,
} from "./instance-config.schemas";
import {
	createModelTargetImpl,
	deleteModelTargetImpl,
	deleteProviderCredentialImpl,
	getOrganizationSettingsImpl,
	listModelTargetsImpl,
	listProviderCredentialsImpl,
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
	.validator(modelTargetCreateSchema)
	.handler(({ data }) => createModelTargetImpl(data));

export const updateModelTargetFn = createServerFn({ method: "POST" })
	.validator(modelTargetUpdateSchema)
	.handler(({ data }) => updateModelTargetImpl(data));

export const deleteModelTargetFn = createServerFn({ method: "POST" })
	.validator(modelTargetIdSchema)
	.handler(({ data }) => deleteModelTargetImpl(data));

// ============================================================================
// Provider credentials
// ============================================================================

export const listProviderCredentialsFn = createServerFn({ method: "GET" }).handler(() => listProviderCredentialsImpl());

export const upsertProviderCredentialFn = createServerFn({ method: "POST" })
	.validator(upsertProviderCredentialSchema)
	.handler(({ data }) => upsertProviderCredentialImpl(data));

export const deleteProviderCredentialFn = createServerFn({ method: "POST" })
	.validator(providerSchema)
	.handler(({ data }) => deleteProviderCredentialImpl(data));

export const verifyProviderCredentialFn = createServerFn({ method: "POST" })
	.validator(providerSchema)
	.handler(({ data }) => verifyProviderCredentialImpl(data));

// ============================================================================
// Organization settings (entitlements) — staff-only
// ============================================================================

export const getOrganizationSettingsFn = createServerFn({ method: "GET" })
	.validator(organizationIdSchema)
	.handler(({ data }) => getOrganizationSettingsImpl(data));

export const setOrganizationSettingsFn = createServerFn({ method: "POST" })
	.validator(setOrganizationSettingsSchema)
	.handler(({ data }) => setOrganizationSettingsImpl(data));
