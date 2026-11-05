import { isLoopbackHost } from "@better-auth/core/utils/host";

export function isLoopbackRedirectUri(uri: string): boolean {
	try {
		return isLoopbackHost(new URL(uri).hostname);
	} catch {
		return false;
	}
}
