/**
 * Auth0 is authoritative over who belongs where, not over which orgs exist:
 * orgs are created by the admin API (`POST /api/v1/brands`) before their users
 * sign in, so an `elmo_orgs` entry with no row here is skipped.
 *
 * The sync runs in provisionUser, before the session cookie is set, so the
 * cookie already carries the synced role and flags.
 */

import type { CreateAuthOptions } from "@workspace/lib/auth/server";
import { findAccountByProvider, syncMemberships, updateUserFlags } from "@workspace/lib/db/auth-sync";
import { ManagementClient } from "auth0";
import { z } from "zod";

interface Auth0AppMetadata {
	elmo_orgs: Array<{ id: string; name: string }>;
	elmo_report_generator_access?: boolean;
	elmo_admin?: boolean;
}

let managementClient: ManagementClient | null = null;

const Auth0AppMetadataSchema = z.object({
	elmo_orgs: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string().min(1),
		}),
	),
	elmo_report_generator_access: z.boolean().optional(),
	elmo_admin: z.boolean().optional(),
});

const REVOKED_METADATA: Auth0AppMetadata = {
	elmo_orgs: [],
	elmo_report_generator_access: false,
	elmo_admin: false,
};

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
	const { app_metadata } = await client.users.get(auth0UserId);

	const parsed = Auth0AppMetadataSchema.safeParse(app_metadata);
	if (!parsed.success) {
		// Missing/malformed metadata in a successful Auth0 response revokes access by policy.
		console.error(
			`[auth0-sync] Invalid app_metadata for auth0UserId=${auth0UserId}; revoking access`,
			parsed.error.issues,
		);
		return REVOKED_METADATA;
	}
	return parsed.data;
}

async function syncOrganizations(userId: string, orgs: Array<{ id: string; name: string }>): Promise<void> {
	const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
	const { added, removed, invalid } = await syncMemberships(
		userId,
		orgs.map((o) => o.id),
	);
	if (invalid.length > 0) {
		console.warn(`[auth0-sync] user=${userId} orgs not provisioned here, invalid=[${invalid.join(", ")}]`);
	}
	if (added.length > 0 || removed.length > 0) {
		const parts: string[] = [];
		if (added.length > 0) parts.push(`added=[${added.map((id) => orgNameById.get(id) ?? id).join(", ")}]`);
		if (removed.length > 0) parts.push(`removed=[${removed.join(", ")}]`);
		console.log(`[auth0-sync] user=${userId} ${parts.join(" ")}`);
	} else {
		console.log(`[auth0-sync] user=${userId} already in sync`);
	}
}

/** Returns the flags so the caller can apply them to the user before the session cookie is set. */
export async function syncAuth0User(
	userId: string,
	auth0UserId: string,
): Promise<{ role: string; hasReportGeneratorAccess: boolean }> {
	console.log(`[auth0-sync] Syncing user=${userId}`);
	const metadata = await fetchAuth0AppMetadata(auth0UserId);

	await syncOrganizations(userId, metadata.elmo_orgs);

	const flags = {
		role: metadata.elmo_admin ? "admin" : "user",
		hasReportGeneratorAccess: metadata.elmo_report_generator_access ?? false,
	};
	await updateUserFlags(userId, flags);

	return flags;
}

/** Null for a user with no linked Auth0 account. */
export async function syncAuth0UserById(
	userId: string,
): Promise<{ role: string; hasReportGeneratorAccess: boolean } | null> {
	const acc = await findAccountByProvider(userId, (p) => p === "auth0-whitelabel");
	if (!acc) return null;
	return syncAuth0User(userId, acc.accountId);
}

export function getWhitelabelAuthOptions(): CreateAuthOptions {
	const domain = process.env.AUTH0_DOMAIN!;
	return {
		emailAndPasswordEnabled: false,
		disableSignUp: true,
		trustedOrigins: [`https://${domain}`],
		sso: {
			defaultSSO: [
				{
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
				},
			],
			provisionUser: async ({ user, userInfo }: { user: { id: string }; userInfo: Record<string, any> }) => {
				const flags = await syncAuth0User(user.id, userInfo.id);
				Object.assign(user, flags);
			},
		},
	};
}
