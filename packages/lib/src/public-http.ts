import type { AgentOptions } from "node:https";
import nodeFetch, { type RequestInit, type Response } from "node-fetch";
import { useAgent } from "request-filtering-agent";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type FetchImplementation = typeof nodeFetch;

interface PublicHttpDependencies {
	/** Deterministic socket resolution for security tests; production never supplies it. */
	lookup?: AgentOptions["lookup"];
	/** Redirect-chain test seam; production always uses node-fetch. */
	fetch?: FetchImplementation;
}

function parsePublicHttpUrl(input: string | URL): URL {
	const url = input instanceof URL ? input : new URL(input);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Public HTTP fetch rejects protocol ${url.protocol}`);
	}
	if (url.username || url.password) throw new Error("Public HTTP fetch rejects URL credentials");
	return url;
}

function discardRedirectBody(response: Response): void {
	const body = response.body as (NodeJS.ReadableStream & { destroy?: () => void }) | null;
	body?.destroy?.();
}

/**
 * GET a public HTTP(S) resource with socket-time DNS filtering. The filtering
 * agent validates the exact address used by the connection, which closes the
 * DNS-rebinding gap left by preflight-only hostname checks. Redirects are
 * followed manually so every hop receives a fresh protocol-appropriate agent.
 */
export async function fetchPublicHttp(
	input: string | URL,
	init: RequestInit = {},
	dependencies: PublicHttpDependencies = {},
): Promise<Response> {
	const method = init.method?.toUpperCase() ?? "GET";
	if (method !== "GET" && method !== "HEAD") throw new Error("Public HTTP fetch only permits GET or HEAD");
	const fetchImplementation = dependencies.fetch ?? nodeFetch;
	let url = parsePublicHttpUrl(input);

	for (let redirects = 0; ; redirects++) {
		const agent = useAgent(url.toString(), dependencies.lookup ? { lookup: dependencies.lookup } : undefined);
		const response = await fetchImplementation(url, {
			...init,
			method,
			redirect: "manual",
			follow: 0,
			size: MAX_RESPONSE_BYTES,
			agent,
		});
		if (!REDIRECT_STATUSES.has(response.status)) return response;
		const location = response.headers.get("location");
		if (!location) return response;
		if (redirects >= MAX_REDIRECTS) {
			discardRedirectBody(response);
			throw new Error(`Public HTTP fetch exceeded ${MAX_REDIRECTS} redirects`);
		}
		discardRedirectBody(response);
		url = parsePublicHttpUrl(new URL(location, url));
	}
}
