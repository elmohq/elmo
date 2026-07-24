import { getDeploymentModeFromEnv } from "@workspace/config/env";
import { type CredentialSource, instanceCredentialSource, refreshCredentialOverlay } from "@workspace/lib/secrets";

const CREDENTIAL_REFRESH_INTERVAL_MS = 60_000;

/** Managed cloud loads provider credentials from Infisical; every other mode
 *  reads the encrypted provider_credentials table (with env fallback). */
async function getCredentialSource(env: Record<string, string | undefined>): Promise<CredentialSource> {
	if (getDeploymentModeFromEnv(env) !== "cloud") return instanceCredentialSource;
	const { createInfisicalCredentialLoader } = await import("@workspace/cloud/infisical-credentials");
	return createInfisicalCredentialLoader({ env });
}

export async function startCredentialRefresh(
	env: Record<string, string | undefined> = process.env,
): Promise<NodeJS.Timeout> {
	const source = await getCredentialSource(env);
	const refresh = () => refreshCredentialOverlay(source);
	await refresh();
	const timer = setInterval(() => {
		refresh().catch((error) => {
			console.warn("Provider credential refresh failed — keeping previous credentials:", error);
		});
	}, CREDENTIAL_REFRESH_INTERVAL_MS);
	timer.unref();
	return timer;
}
