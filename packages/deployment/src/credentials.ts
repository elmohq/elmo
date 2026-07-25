import { getDeploymentModeFromEnv } from "@workspace/config/env";
import { type CredentialSource, instanceCredentialSource, refreshCredentialOverlay } from "@workspace/lib/secrets";

const CREDENTIAL_REFRESH_INTERVAL_MS = 60_000;

/** Keep the credential overlay fresh from `source`. The interval is scheduled
 *  before the first load, so a source that is briefly unreachable recovers on its
 *  own instead of leaving the process permanently stale.
 *
 *  `required` says whether the caller can run without credentials. Only managed
 *  cloud sets it: there is no environment fallback there, so a worker that
 *  started anyway would take jobs it cannot run. Self-hosted deployments always
 *  have their `.env` credentials, and on an upgrade the database may not even be
 *  migrated yet, so they log and carry on. */
export async function startCredentialRefresh(
	source: CredentialSource,
	{ required }: { required: boolean },
): Promise<NodeJS.Timeout> {
	const refresh = () => refreshCredentialOverlay(source);
	const timer = setInterval(() => {
		refresh().catch((error) => {
			console.error("[secrets] credential refresh failed — serving the previous values:", error);
		});
	}, CREDENTIAL_REFRESH_INTERVAL_MS);
	timer.unref();

	try {
		await refresh();
	} catch (error) {
		if (required) {
			clearInterval(timer);
			throw error;
		}
		console.error("[secrets] could not load stored credentials — using environment credentials for now:", error);
	}
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
	void startCredentialRefresh(instanceCredentialSource, { required: false }).catch((error) => {
		console.error("[secrets] initial credential load failed — falling back to environment credentials:", error);
	});
}
