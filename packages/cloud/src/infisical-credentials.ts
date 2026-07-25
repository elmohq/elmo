import { InfisicalSDK } from "@infisical/sdk";
import { CREDENTIAL_ENV_NAMES } from "@workspace/config/env-registry";
import type { CredentialSource } from "@workspace/lib/secrets";

const CLIENT_ID_ENV = "INFISICAL_CLIENT_ID";
const CLIENT_SECRET_ENV = "INFISICAL_CLIENT_SECRET";
const PROJECT_ID_ENV = "INFISICAL_PROJECT_ID";
const ENVIRONMENT_ENV = "INFISICAL_ENVIRONMENT";
const SECRET_PATH_ENV = "INFISICAL_SECRET_PATH";
const SITE_URL_ENV = "INFISICAL_SITE_URL";

interface InfisicalClient {
	auth(): {
		universalAuth: {
			login(options: { clientId: string; clientSecret: string }): Promise<InfisicalClient>;
		};
	};
	secrets(): {
		listSecretsWithImports(options: {
			environment: string;
			projectId: string;
			secretPath: string;
			expandSecretReferences: boolean;
			viewSecretValue: boolean;
		}): Promise<Array<{ secretKey: string; secretValue: string }>>;
	};
}

export interface InfisicalCredentialLoaderOptions {
	env?: Record<string, string | undefined>;
	clientFactory?: (siteUrl?: string) => InfisicalClient;
}

function required(env: Record<string, string | undefined>, name: string): string {
	const value = env[name]?.trim();
	if (!value) throw new Error(`${name} is required for cloud provider credentials`);
	return value;
}

/** Cloud-only credential loader. Provider secret names in Infisical match the
 * canonical env names (OPENAI_API_KEY, OXYLABS_USERNAME, etc.). */
export function createInfisicalCredentialLoader(options: InfisicalCredentialLoaderOptions = {}): CredentialSource {
	const env = options.env ?? process.env;
	const clientId = required(env, CLIENT_ID_ENV);
	const clientSecret = required(env, CLIENT_SECRET_ENV);
	const projectId = required(env, PROJECT_ID_ENV);
	const environment = required(env, ENVIRONMENT_ENV);
	const secretPath = env[SECRET_PATH_ENV]?.trim() || "/";
	const siteUrl = env[SITE_URL_ENV]?.trim() || undefined;
	const clientFactory = options.clientFactory ?? ((url) => new InfisicalSDK(url ? { siteUrl: url } : undefined));

	let clientPromise: Promise<InfisicalClient> | null = null;
	const authenticate = () => {
		clientPromise ??= clientFactory(siteUrl).auth().universalAuth.login({ clientId, clientSecret });
		return clientPromise;
	};
	const list = async () => {
		const client = await authenticate();
		// Non-recursive: the identity reads exactly one folder, so unrelated
		// project secrets never reach this process and two folders cannot both
		// define OPENAI_API_KEY with no defined winner.
		return client.secrets().listSecretsWithImports({
			environment,
			projectId,
			secretPath,
			expandSecretReferences: true,
			viewSecretValue: true,
		});
	};

	return async () => {
		let secrets: Array<{ secretKey: string; secretValue: string }>;
		try {
			secrets = await list();
		} catch {
			// Access tokens expire. Re-authenticate once before surfacing an outage;
			// refreshCredentialOverlay keeps the last good values if both attempts fail.
			clientPromise = null;
			secrets = await list();
		}

		const credentials = new Map<string, string>();
		for (const secret of secrets) {
			if (CREDENTIAL_ENV_NAMES.has(secret.secretKey) && secret.secretValue.trim().length > 0) {
				credentials.set(secret.secretKey, secret.secretValue);
			}
		}
		// Cloud has no environment fallback, so "the call succeeded and returned
		// nothing" is an outage — a revoked read grant, or a path/environment slug
		// that no longer resolves. Throwing keeps the last good overlay in place
		// instead of quietly unconfiguring every provider.
		if (credentials.size === 0) {
			throw new Error(
				`Infisical returned no provider credentials from ${secretPath} in "${environment}" — check the machine identity's read access and ${SECRET_PATH_ENV}`,
			);
		}
		return credentials;
	};
}
