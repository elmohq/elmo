/**
 * Whitelabel auth hooks for better-auth.
 *
 * Syncs Auth0 app_metadata to better-auth's organization/user tables
 * on SSO login via the provisionUser callback.
 *
 * Data flow:
 * 1. User logs in via Auth0 SSO -> better-auth creates user + session
 * 2. provisionUser fires (before session cookie is set)
 * 3. Fetches app_metadata from Auth0 Management API
 * 4. Upserts better-auth organizations from elmo_orgs
 * 5. Sets user admin role and report generator access flags
 * 6. Mutates the user object so the session cookie has correct data
 *
 * NOTE: This module is separately licensed from the core auth package.
 */
import { ManagementClient } from "auth0";
import type { CreateAuthOptions } from "@workspace/lib/auth/server";
import {
	upsertOrganization,
	ensureMembership,
	updateUserFlags,
} from "@workspace/lib/db/auth-sync";

interface Auth0AppMetadata {
	elmo_orgs?: Array<{ id: string; name: string }>;
	elmo_report_generator_access?: boolean;
	elmo_admin?: boolean;
}

let managementClient: ManagementClient | null = null;

function getManagementClient(): ManagementClient {
	if (!managementClient) {
		managementClient = new ManagementClient({
			domain: process.env.AUTH0_MGMT_API_DOMAIN!,
			clientId: process.env.AUTH0_CLIENT_ID!,
			clientSecret: process.env.AUTH0_CLIENT_SECRET!,
		});
	}
	return managementClient;
}

async function fetchAuth0AppMetadata(auth0UserId: string): Promise<Auth0AppMetadata> {
	const client = getManagementClient();
	const userData = await client.users.get(auth0UserId);
	return (userData.data as { app_metadata?: Auth0AppMetadata })?.app_metadata ?? {};
}

async function syncOrganizations(
	userId: string,
	orgs: Array<{ id: string; name: string }>,
): Promise<void> {
	for (const org of orgs) {
		await upsertOrganization(org);
		await ensureMembership(userId, org.id);
	}
}

/**
 * Syncs Auth0 app_metadata for a user on login.
 *
 * Fetches metadata from Auth0 Management API, upserts organizations,
 * and updates user flags (admin role, report generator access).
 *
 * Returns the resolved flags so the caller can apply them to the user
 * object before the session cookie is set.
 */
export async function syncAuth0User(
	userId: string,
	auth0UserId: string,
): Promise<{ role: string; hasReportGeneratorAccess: boolean }> {
	const metadata = await fetchAuth0AppMetadata(auth0UserId);

	await Promise.all([
		syncOrganizations(userId, metadata.elmo_orgs ?? []),
		updateUserFlags(userId, {
			role: metadata.elmo_admin ? "admin" : "user",
			hasReportGeneratorAccess: metadata.elmo_report_generator_access ?? false,
		}),
	]);

	return {
		role: metadata.elmo_admin ? "admin" : "user",
		hasReportGeneratorAccess: metadata.elmo_report_generator_access ?? false,
	};
}

/**
 * Returns the CreateAuthOptions for whitelabel deployments.
 *
 * Wires up Auth0 OIDC SSO and the provisionUser callback that syncs
 * Auth0 app_metadata into better-auth's user/org tables on login.
 */
export function getWhitelabelAuthOptions(): CreateAuthOptions {
	const domain = process.env.AUTH0_DOMAIN!;
	return {
		emailAndPasswordEnabled: false,
		trustedOrigins: [`https://${domain}`],
		sso: {
			defaultSSO: [{
				providerId: "auth0-whitelabel",
				domain,
				oidcConfig: {
					clientId: process.env.AUTH0_CLIENT_ID!,
					clientSecret: process.env.AUTH0_CLIENT_SECRET!,
					issuer: `https://${domain}/`,
					discoveryEndpoint: `https://${domain}/.well-known/openid-configuration`,
					authorizationEndpoint: `https://${domain}/authorize`,
					tokenEndpoint: `https://${domain}/oauth/token`,
					userInfoEndpoint: `https://${domain}/userinfo`,
					jwksEndpoint: `https://${domain}/.well-known/jwks.json`,
					tokenEndpointAuthentication: "client_secret_post",
					pkce: true,
				},
			}],
			provisionUser: async ({ user, userInfo }: { user: { id: string }; userInfo: Record<string, any> }) => {
				const flags = await syncAuth0User(user.id, userInfo.id);
				Object.assign(user, flags);
			},
		},
	};
}
