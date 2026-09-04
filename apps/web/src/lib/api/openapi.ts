/**
 * The spec on disk names no host and no operator — it is the shape of the API,
 * not of any one deployment. Both get filled in when an instance serves it, so
 * a whitelabel or self-hosted client reads its own address instead of ours.
 */
import spec from "@workspace/api-spec";

interface OpenApiServer {
	url: string;
	description?: string;
}

export interface OpenApiDocument {
	info: Record<string, unknown>;
	servers?: OpenApiServer[];
	[key: string]: unknown;
}

/**
 * `origin` is where this request arrived, not the configured app URL: whoever
 * just fetched the spec from that host can reach the API on it, which is not
 * true of a stale `APP_URL`. The operator's own URL still names the contact.
 */
export function deploymentOpenApiSpec(branding: { name: string; url: string }, origin: string): OpenApiDocument {
	const document = spec as unknown as OpenApiDocument;

	return {
		...document,
		info: {
			...document.info,
			title: `${branding.name} API`,
			// The license stays as it is: the software really is the one it names.
			contact: { name: branding.name, url: branding.url },
		},
		servers: (document.servers ?? []).map((server) => ({ ...server, url: new URL(server.url, origin).href })),
	};
}
