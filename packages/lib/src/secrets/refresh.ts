import { refreshCredentialOverlay } from "./store";

const CREDENTIAL_REFRESH_INTERVAL_MS = 60_000;

/** Keep the credential overlay fresh. The interval is scheduled before the first
 *  load, so a database that is briefly unreachable recovers on its own instead of
 *  leaving the process permanently stale.
 *
 *  Never rejects. Environment credentials are always there to fall back on, and
 *  on an upgrade the database may not even be migrated yet, so a failed load logs
 *  and carries on. Resolves once the first load has been attempted: the worker
 *  awaits that so stored credentials count toward its startup validation, while
 *  the web app leaves it running in the background rather than delaying boot. */
export async function startCredentialRefresh(): Promise<NodeJS.Timeout> {
	const timer = setInterval(() => {
		refreshCredentialOverlay().catch((error) => {
			console.error("[secrets] credential refresh failed — serving the previous values:", error);
		});
	}, CREDENTIAL_REFRESH_INTERVAL_MS);
	timer.unref();

	try {
		await refreshCredentialOverlay();
	} catch (error) {
		console.error("[secrets] could not load stored credentials — using environment credentials for now:", error);
	}
	return timer;
}
