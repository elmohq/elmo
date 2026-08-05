import { CLOUD_API_KEY_CONFIG_ID } from "@workspace/cloud/api-key";
import type { DeploymentMode } from "@workspace/config/types";
import { resolveOrganizationEntitlements } from "@workspace/lib/cloud/entitlements";
import { evaluateApiKeyAuth, getAdminApiKeys } from "@/lib/auth/policies";
import { getDeployment } from "@/lib/config/server";

export type ApiRequestScope = { kind: "instance" } | { kind: "organization"; organizationId: string; apiKeyId: string };

export type ApiAuthenticationResult =
	| { ok: true; scope: ApiRequestScope }
	| { ok: false; status: 401 | 403 | 429; error: string; message: string };

interface CloudApiKeyVerification {
	valid: boolean;
	error: { code?: string; message?: string } | null;
	key: { id: string; configId: string; referenceId: string } | null;
}

interface ApiAuthenticationDependencies {
	adminApiKeys: readonly string[];
	verifyCloudApiKey(input: { key: string; permission: "read" | "write" }): Promise<CloudApiKeyVerification>;
	resolveCloudEntitlements(organizationId: string): Promise<{ mode: string; access?: string }>;
}

export function apiPermissionForMethod(method: string): "read" | "write" {
	return method === "GET" || method === "HEAD" ? "read" : "write";
}

function bearerToken(authorizationHeader: string | null | undefined): string | null {
	if (!authorizationHeader?.startsWith("Bearer ")) return null;
	const token = authorizationHeader.slice(7);
	return token && token === token.trim() && !token.includes(" ") ? token : null;
}

export async function authenticateApiAuthorization(
	input: {
		mode: DeploymentMode;
		method: string;
		authorizationHeader: string | null | undefined;
	},
	dependencies: ApiAuthenticationDependencies,
): Promise<ApiAuthenticationResult> {
	if (input.mode !== "cloud") {
		const result = evaluateApiKeyAuth(input.authorizationHeader, [...dependencies.adminApiKeys]);
		return result === "allow"
			? { ok: true, scope: { kind: "instance" } }
			: { ok: false, status: 401, error: "Unauthorized", message: "Valid API key required" };
	}

	const token = bearerToken(input.authorizationHeader);
	if (!token) {
		return {
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Valid API key required as Bearer token in Authorization header",
		};
	}

	const verification = await dependencies.verifyCloudApiKey({
		key: token,
		permission: apiPermissionForMethod(input.method),
	});
	if (!verification.valid || !verification.key) {
		if (verification.error?.code === "RATE_LIMITED") {
			return { ok: false, status: 429, error: "Too Many Requests", message: "API key rate limit exceeded" };
		}
		return { ok: false, status: 401, error: "Unauthorized", message: "Invalid API key" };
	}
	if (verification.key.configId !== CLOUD_API_KEY_CONFIG_ID || verification.key.referenceId.trim().length === 0) {
		return { ok: false, status: 401, error: "Unauthorized", message: "Invalid API key" };
	}

	const organizationId = verification.key.referenceId;
	const entitlements = await dependencies.resolveCloudEntitlements(organizationId);
	if (entitlements.mode !== "cloud" || entitlements.access !== "allowed") {
		return {
			ok: false,
			status: 403,
			error: "Forbidden",
			message: "This workspace does not have active API access",
		};
	}

	return {
		ok: true,
		scope: { kind: "organization", organizationId, apiKeyId: verification.key.id },
	};
}

interface ApiKeyVerifier {
	verifyApiKey(input: {
		body: {
			configId: string;
			key: string;
			permissions: { elmoApi: ("read" | "write")[] };
		};
	}): Promise<CloudApiKeyVerification>;
}

export async function authenticateApiRequest(request: Request): Promise<ApiAuthenticationResult> {
	const deployment = getDeployment();
	return authenticateApiAuthorization(
		{
			mode: deployment.mode,
			method: request.method,
			authorizationHeader: request.headers.get("Authorization"),
		},
		{
			adminApiKeys: getAdminApiKeys(),
			verifyCloudApiKey: async ({ key, permission }) => {
				const { auth } = await import("@/lib/auth/server");
				const api = auth.api as typeof auth.api & ApiKeyVerifier;
				return api.verifyApiKey({
					body: {
						configId: CLOUD_API_KEY_CONFIG_ID,
						key,
						permissions: { elmoApi: [permission] },
					},
				});
			},
			resolveCloudEntitlements: (organizationId) => resolveOrganizationEntitlements({ mode: "cloud", organizationId }),
		},
	);
}
