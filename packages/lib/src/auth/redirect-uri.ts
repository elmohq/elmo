import { isLoopbackHost } from "@better-auth/core/utils/host";

/** Whether a redirect sends the browser back to the user's own machine, which
 * is where a CLI or desktop client listens. */
export function isLoopbackRedirectUri(uri: string): boolean {
	try {
		return isLoopbackHost(new URL(uri).hostname);
	} catch {
		return false;
	}
}
