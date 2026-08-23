import { lookup } from "node:dns/promises";
import { isBlockedHostname, isIpLiteral, isPrivateAddress, ToolError } from "./site-url";

/**
 * The only way these tools reach the network. Server-only.
 *
 * Every hop is checked before it is requested: redirects are followed by hand so
 * a public hostname cannot bounce us onto localhost or a cloud metadata endpoint,
 * responses are capped so a huge file cannot exhaust the function, and the whole
 * call shares one deadline.
 *
 * Residual risk worth naming: a hostname can resolve to a public address for our
 * check and a private one for the request that follows (DNS rebinding). Pinning
 * the resolved address would need a custom dispatcher; the checks here stop the
 * straightforward attacks, and neither tool has credentials to leak.
 */

const USER_AGENT = "ElmoBot/1.0 (+https://www.elmohq.com/tools)";
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 512 * 1024;

export interface RemoteResponse {
	/** The URL that actually served the body, after redirects. */
	url: string;
	status: number;
	ok: boolean;
	contentType: string | null;
	body: string;
	/** True when the response hit the byte cap and was cut short. */
	truncated: boolean;
}

async function assertPublicHost(hostname: string): Promise<void> {
	if (isIpLiteral(hostname)) throw new ToolError("Enter a domain name rather than an IP address.");
	if (isBlockedHostname(hostname)) throw new ToolError(`"${hostname}" is not a public domain.`);

	let addresses: { address: string }[];
	try {
		addresses = await lookup(hostname, { all: true });
	} catch {
		throw new ToolError(`Could not resolve "${hostname}". Check the spelling and try again.`);
	}

	if (addresses.length === 0) throw new ToolError(`Could not resolve "${hostname}".`);
	if (addresses.some((entry) => isPrivateAddress(entry.address))) {
		throw new ToolError(`"${hostname}" points at a private address, so it cannot be checked.`);
	}
}

async function readCapped(response: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
	if (!response.body) return { body: "", truncated: false };

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");
	let received = 0;
	let body = "";
	let truncated = false;

	try {
		while (received < maxBytes) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			received += value.byteLength;
			if (received > maxBytes) {
				body += decoder.decode(value.subarray(0, value.byteLength - (received - maxBytes)), { stream: false });
				truncated = true;
				break;
			}
			body += decoder.decode(value, { stream: true });
		}
		if (!truncated) body += decoder.decode();
	} finally {
		await reader.cancel().catch(() => {});
	}

	return { body, truncated };
}

export async function fetchRemoteText(
	target: URL,
	options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {},
): Promise<RemoteResponse> {
	const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, accept = "*/*" } = options;
	const signal = AbortSignal.timeout(timeoutMs);
	let current = target;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		await assertPublicHost(current.hostname);

		let response: Response;
		try {
			response = await fetch(current, {
				redirect: "manual",
				signal,
				headers: { "user-agent": USER_AGENT, accept },
			});
		} catch (error) {
			if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new ToolError(`${current.hostname} took too long to respond.`);
			}
			throw new ToolError(`Could not reach ${current.hostname}.`);
		}

		const location = response.headers.get("location");
		if (response.status >= 300 && response.status < 400 && location) {
			let next: URL;
			try {
				next = new URL(location, current);
			} catch {
				throw new ToolError(`${current.hostname} returned a redirect we could not follow.`);
			}
			if (next.protocol !== "http:" && next.protocol !== "https:") {
				throw new ToolError(`${current.hostname} redirected to an address we do not follow.`);
			}
			current = next;
			continue;
		}

		const { body, truncated } = await readCapped(response, maxBytes);
		return {
			url: current.toString(),
			status: response.status,
			ok: response.ok,
			contentType: response.headers.get("content-type"),
			body,
			truncated,
		};
	}

	throw new ToolError(`${target.hostname} redirected too many times.`);
}
