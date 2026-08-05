import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { type ApiKey, CLOUD_API_KEY_CONFIG_ID } from "@workspace/cloud/api-key";
import { requireAuthSession } from "@/lib/auth/helpers";
import { auth } from "@/lib/auth/server";
import {
	createWorkspaceApiKeyInputSchema,
	listWorkspaceApiKeysInputSchema,
	revokeWorkspaceApiKeyInputSchema,
	workspaceApiKeyCreateBody,
} from "@/lib/cloud-api-keys";
import { getDeployment } from "@/lib/config/server";

interface CloudApiKeyManagementApi {
	createApiKey(input: {
		body: { configId: string; organizationId: string; name: string };
		headers: Headers;
	}): Promise<ApiKey>;
	getApiKey(input: { query: { configId: string; id: string }; headers: Headers }): Promise<Omit<ApiKey, "key">>;
	listApiKeys(input: {
		query: {
			configId: string;
			organizationId: string;
			limit: number;
			offset: number;
			sortBy: string;
			sortDirection: "desc";
		};
		headers: Headers;
	}): Promise<{ apiKeys: Omit<ApiKey, "key">[]; total: number }>;
	deleteApiKey(input: { body: { configId: string; keyId: string }; headers: Headers }): Promise<{ success: boolean }>;
}

export interface WorkspaceApiKeySummary {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	enabled: boolean;
	lastRequest: string | null;
	expiresAt: string | null;
	createdAt: string;
}

export interface CreatedWorkspaceApiKey {
	secret: string;
	apiKey: WorkspaceApiKeySummary;
}

function requireCloudDeployment(): void {
	if (getDeployment().mode !== "cloud") throw new Error("Cloud API keys are not available in this deployment");
}

function managementApi(): CloudApiKeyManagementApi {
	return auth.api as typeof auth.api & CloudApiKeyManagementApi;
}

function isoDate(value: Date | string): string;
function isoDate(value: Date | string | null): string | null;
function isoDate(value: Date | string | null): string | null {
	if (value === null) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeWorkspaceApiKey(key: Omit<ApiKey, "key">): WorkspaceApiKeySummary {
	return {
		id: key.id,
		name: key.name,
		start: key.start,
		prefix: key.prefix,
		enabled: key.enabled,
		lastRequest: isoDate(key.lastRequest),
		expiresAt: isoDate(key.expiresAt),
		createdAt: isoDate(key.createdAt),
	};
}

export const listWorkspaceApiKeysFn = createServerFn({ method: "GET" })
	.validator(listWorkspaceApiKeysInputSchema)
	.handler(async ({ data }): Promise<WorkspaceApiKeySummary[]> => {
		requireCloudDeployment();
		await requireAuthSession();
		const result = await managementApi().listApiKeys({
			query: {
				configId: CLOUD_API_KEY_CONFIG_ID,
				organizationId: data.organizationId,
				limit: 100,
				offset: 0,
				sortBy: "createdAt",
				sortDirection: "desc",
			},
			headers: getRequestHeaders(),
		});
		return result.apiKeys.map(serializeWorkspaceApiKey);
	});

export const createWorkspaceApiKeyFn = createServerFn({ method: "POST" })
	.validator(createWorkspaceApiKeyInputSchema)
	.handler(async ({ data }): Promise<CreatedWorkspaceApiKey> => {
		requireCloudDeployment();
		await requireAuthSession();
		const created = await managementApi().createApiKey({
			body: workspaceApiKeyCreateBody(data),
			headers: getRequestHeaders(),
		});
		const { key: secret, ...record } = created;
		return { secret, apiKey: serializeWorkspaceApiKey(record) };
	});

export const revokeWorkspaceApiKeyFn = createServerFn({ method: "POST" })
	.validator(revokeWorkspaceApiKeyInputSchema)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		requireCloudDeployment();
		await requireAuthSession();
		const headers = getRequestHeaders();
		const key = await managementApi().getApiKey({
			query: { configId: CLOUD_API_KEY_CONFIG_ID, id: data.keyId },
			headers,
		});
		if (key.referenceId !== data.organizationId || key.configId !== CLOUD_API_KEY_CONFIG_ID) {
			throw new Error("API key does not belong to this workspace");
		}
		return managementApi().deleteApiKey({
			body: { configId: CLOUD_API_KEY_CONFIG_ID, keyId: data.keyId },
			headers,
		});
	});
