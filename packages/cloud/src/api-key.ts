import { type ApiKeyConfigurationOptions, apiKey } from "@better-auth/api-key";
import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc as organizationAdmin,
	memberAc as organizationMember,
	ownerAc as organizationOwner,
	defaultStatements as organizationStatements,
} from "better-auth/plugins/organization/access";

export type { ApiKey } from "@better-auth/api-key";

export const CLOUD_API_KEY_CONFIG_ID = "elmo-cloud-v1";
export const CLOUD_API_KEY_PREFIX = "elmo_";
export const CLOUD_API_KEY_RATE_LIMIT_WINDOW_MS = 60_000;
export const CLOUD_API_KEY_RATE_LIMIT_MAX_REQUESTS = 120;

export const cloudOrganizationStatements = {
	...organizationStatements,
	apiKey: ["create", "read", "update", "delete"],
} as const;

export const cloudOrganizationAccessControl = createAccessControl(cloudOrganizationStatements);

export const cloudOrganizationRoles = {
	owner: cloudOrganizationAccessControl.newRole({
		...organizationOwner.statements,
		apiKey: ["create", "read", "delete"],
	}),
	admin: cloudOrganizationAccessControl.newRole({
		...organizationAdmin.statements,
		apiKey: ["create", "read", "delete"],
	}),
	member: cloudOrganizationAccessControl.newRole({
		...organizationMember.statements,
		apiKey: [],
	}),
};

export const cloudApiKeyConfiguration = {
	configId: CLOUD_API_KEY_CONFIG_ID,
	references: "organization",
	storage: "database",
	disableKeyHashing: false,
	enableSessionForAPIKeys: false,
	defaultPrefix: CLOUD_API_KEY_PREFIX,
	requireName: true,
	minimumNameLength: 1,
	maximumNameLength: 64,
	startingCharactersConfig: {
		shouldStore: true,
		charactersLength: 12,
	},
	rateLimit: {
		enabled: true,
		timeWindow: CLOUD_API_KEY_RATE_LIMIT_WINDOW_MS,
		maxRequests: CLOUD_API_KEY_RATE_LIMIT_MAX_REQUESTS,
	},
	permissions: {
		defaultPermissions: {
			elmoApi: ["read", "write"],
		},
	},
} as const satisfies ApiKeyConfigurationOptions;

export const cloudApiKeyPlugin = apiKey([cloudApiKeyConfiguration]);
