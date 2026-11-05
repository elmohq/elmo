import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";

export interface HttpRequest {
	url: string;
	method?: "GET" | "HEAD";
	headers?: Record<string, string>;
	timeoutMs?: number;
	maxBytes?: number;
	signal?: AbortSignal;
}

export interface HttpResponse {
	url: string;
	status: number;
	/** Lowercased names; repeated headers joined with ", ". */
	headers: Record<string, string>;
	body: string;
	truncated: boolean;
}

export class BlockedHostError extends Error {}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function ipv4ToInt(ip: string): number {
	return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 3],
];

export function isPublicAddress(ip: string): boolean {
	if (isIP(ip) === 4) {
		const value = ipv4ToInt(ip);
		return !BLOCKED_V4.some(([base, bits]) => {
			const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
			return (value & mask) === (ipv4ToInt(base) & mask);
		});
	}
	if (isIP(ip) === 6) {
		const lower = ip.toLowerCase();
		const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPublicAddress(mapped[1] as string);
		if (lower === "::" || lower === "::1") return false;
		// Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8), documentation (2001:db8::/32).
		return !/^(f[cd]|fe[89ab]|ff)/.test(lower) && !lower.startsWith("2001:db8:");
	}
	return false;
}

// Validating inside the socket's own lookup means the address that was checked
// is the one connected to, so DNS can't be rebound between check and connect.
const guardedLookup: LookupFunction = (hostname, options, callback) => {
	dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) return callback(error, "", 0);
		const list = addresses as { address: string; family: number }[];
		const allowed = list.filter((entry) => isPublicAddress(entry.address));
		if (allowed.length === 0) {
			return callback(new BlockedHostError(`${hostname} resolves to a private or reserved address`), "", 0);
		}
		if (options.all) return callback(null, allowed as never, 0);
		const first = allowed[0] as { address: string; family: number };
		callback(null, first.address, first.family);
	});
};

function decoderFor(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | undefined {
	switch (encoding?.trim().toLowerCase()) {
		case "gzip":
		case "x-gzip":
			return zlib.createGunzip();
		case "deflate":
			return zlib.createInflate();
		case "br":
			return zlib.createBrotliDecompress();
		default:
			return undefined;
	}
}

function flattenHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(raw)) {
		if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
	}
	return headers;
}

/** Reads a response body up to `maxBytes`, decompressing as it goes so a small compressed body can't expand without limit. */
function readBody(
	res: http.IncomingMessage,
	request: HttpRequest,
	headers: Record<string, string>,
): Promise<{ body: string; truncated: boolean }> {
	const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
	const hasBody = request.method !== "HEAD" && res.statusCode !== 204 && res.statusCode !== 304;
	const decoder = hasBody ? decoderFor(headers["content-encoding"]) : undefined;
	const stream = decoder ? res.pipe(decoder) : res;
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let done = false;
		const finish = (truncated: boolean) => {
			if (done) return;
			done = true;
			resolve({ body: Buffer.concat(chunks).toString("utf8"), truncated });
		};
		stream.on("data", (chunk: Buffer) => {
			if (done) return;
			size += chunk.length;
			if (size <= maxBytes) return void chunks.push(chunk);
			chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
			res.destroy();
			finish(true);
		});
		stream.on("end", () => finish(false));
		stream.on("error", (error) => {
			if (!done) reject(error);
		});
	});
}

function rejectUnsafe(url: URL, allowPrivateNetwork: boolean): BlockedHostError | undefined {
	if (allowPrivateNetwork) return undefined;
	if (url.protocol !== "https:") return new BlockedHostError(`Only HTTPS URLs are audited: ${url}`);
	if (url.port && url.port !== "443") return new BlockedHostError(`Only the default HTTPS port is audited: ${url}`);
	const literal = url.hostname.replace(/^\[|\]$/g, "");
	if (isIP(literal) && !isPublicAddress(literal))
		return new BlockedHostError(`${url.hostname} is a private or reserved address`);
	return undefined;
}

/** One request, no redirects followed. */
export function httpRequest(request: HttpRequest, allowPrivateNetwork = false): Promise<HttpResponse> {
	const url = new URL(request.url);
	const unsafe = rejectUnsafe(url, allowPrivateNetwork);
	if (unsafe) return Promise.reject(unsafe);
	const transport = url.protocol === "https:" ? https : http;

	return new Promise((resolve, reject) => {
		const req = transport.request(
			url,
			{
				method: request.method ?? "GET",
				headers: { "accept-encoding": "gzip, deflate, br", ...request.headers },
				lookup: allowPrivateNetwork ? undefined : guardedLookup,
				timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				signal: request.signal,
			},
			(res) => {
				const headers = flattenHeaders(res.headers);
				readBody(res, request, headers)
					.then(({ body, truncated }) =>
						resolve({ url: request.url, status: res.statusCode ?? 0, headers, body, truncated }),
					)
					.catch(reject);
			},
		);
		req.on("timeout", () => req.destroy(new Error(`Timed out fetching ${request.url}`)));
		req.on("error", reject);
		req.end();
	});
}
