/**
 * What the consent screen can honestly say about a client. Its name is whatever
 * it claimed; the domain that published it and where it sends the browser are
 * the parts that were checked, because the token ends up at the latter.
 */
import { isLoopbackRedirectUri } from "@workspace/lib/auth/redirect-uri";

export interface McpClientRow {
	clientId: string;
	clientDiscoveryId: string | null;
	name: string | null;
	redirectUris: string[];
}

export interface McpClientSummary {
	name: string | null;
	/** The domain the client's metadata document was fetched from, so the name
	 * is attributable to someone. Null for a client that registered itself. */
	publisherHost: string | null;
	redirectHosts: string[];
	/** Every redirect goes to the user's own machine, where any program could
	 * be the one listening. */
	loopbackOnly: boolean;
}

export function summarizeMcpClient(client: McpClientRow): McpClientSummary {
	const redirectUris = client.redirectUris.map((uri) => uri.trim()).filter(Boolean);
	const redirectHosts = [
		...new Set(
			redirectUris
				.map((uri) => {
					try {
						return new URL(uri).host;
					} catch {
						// Registration only validates the scheme, so showing the raw
						// string beats hiding that the client asked for something odd.
						return uri;
					}
				})
				.filter(Boolean),
		),
	];
	return {
		name: client.name || null,
		publisherHost: publisherHostOf(client),
		redirectHosts,
		loopbackOnly: redirectUris.length > 0 && redirectUris.every(isLoopbackRedirectUri),
	};
}

/** A metadata-document client is named by the https URL it was fetched from. */
function publisherHostOf(client: McpClientRow): string | null {
	if (client.clientDiscoveryId !== "cimd") return null;
	try {
		return new URL(client.clientId).host;
	} catch {
		return null;
	}
}
