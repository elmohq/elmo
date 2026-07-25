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

/** Load provider credentials, then keep them fresh on an interval. Rejects if the
 *  first load fails, so a process that cannot run a job without credentials —
 *  the worker — dies at boot rather than picking up work it will fail. */
export async function startCredentialRefresh(
	env: Record<string, string | undefined> = process.env,
): Promise<NodeJS.Timeout> {
	const source = await getCredentialSource(env);
	const refresh = () => refreshCredentialOverlay(source);
	await refresh();
	const timer = setInterval(() => {
		refresh().catch((error) => {
			console.error("[secrets] credential refresh failed — serving the previous values:", error);
		});
	}, CREDENTIAL_REFRESH_INTERVAL_MS);
	timer.unref();
	return timer;
}

/** The web entry point. Never blocks a request and never rejects: the app has to
 *  serve sign-in and settings whether or not the credential store is reachable.
 *
 *  Managed cloud is a no-op. That web app runs on Vercel serverless, where
 *  Infisical's Vercel secret sync writes provider credentials into the
 *  environment at deploy time — reading them back over the network would add an
 *  Infisical round trip to every cold start and put Infisical's availability in
 *  front of the whole site. The worker, which is long-lived and actually spends
 *  money against these credentials, keeps the live SDK loader. */
export function startBackgroundCredentialRefresh(env: Record<string, string | undefined> = process.env): void {
	if (getDeploymentModeFromEnv(env) === "cloud") return;
	void startCredentialRefresh(env).catch((error) => {
		console.error("[secrets] initial credential load failed — falling back to environment credentials:", error);
	});
}
