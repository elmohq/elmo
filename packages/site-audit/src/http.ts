import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { pipeline } from "node:stream";
import zlib from "node:zlib";

interface HttpRequest {
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
	bytes: Buffer;
}

export class BlockedHostError extends Error {}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 30_000;

const BLOCKED = new BlockList();
for (const [network, prefix] of [
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
] as const) {
	BLOCKED.addSubnet(network, prefix, "ipv4");
}
// BlockList applies the IPv4 rules to IPv4-mapped addresses (::ffff:a.b.c.d) itself.
// The transition ranges below embed IPv4 addresses too, so they're refused outright.
for (const [network, prefix] of [
	["::", 96],
	["64:ff9b::", 96],
	["100::", 64],
	["2001::", 32],
	["2001:db8::", 32],
	["2002::", 16],
	["fc00::", 7],
	["fe80::", 10],
	["fec0::", 10],
	["ff00::", 8],
] as const) {
	BLOCKED.addSubnet(network, prefix, "ipv6");
}

function isPublicAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 0) return false;
	return !BLOCKED.check(ip, family === 4 ? "ipv4" : "ipv6");
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

// Decompressing as the bytes arrive is what lets `maxBytes` cap a small compressed body that would expand without limit.
function readBody(res: http.IncomingMessage, request: HttpRequest, headers: Record<string, string>): Promise<Buffer> {
	const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
	const hasBody = request.method !== "HEAD" && res.statusCode !== 204 && res.statusCode !== 304;
	const decoder = hasBody ? decoderFor(headers["content-encoding"]) : undefined;
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve(Buffer.concat(chunks));
		};
		const fail = (error: Error) => {
			if (done) return;
			done = true;
			reject(error);
		};
		const stream = decoder ? pipeline(res, decoder, (error) => error && fail(error)) : res;
		stream.on("data", (chunk: Buffer) => {
			if (done) return;
			size += chunk.length;
			if (size > maxBytes) chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
			else chunks.push(chunk);
			if (size >= maxBytes) {
				finish();
				res.destroy();
			}
		});
		stream.on("end", finish);
		stream.on("error", fail);
		res.on("aborted", () => fail(new Error(`Connection closed while reading ${request.url}`)));
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

export function httpRequest(request: HttpRequest, allowPrivateNetwork = false): Promise<HttpResponse> {
	const url = new URL(request.url);
	const unsafe = rejectUnsafe(url, allowPrivateNetwork);
	if (unsafe) return Promise.reject(unsafe);
	const transport = url.protocol === "https:" ? https : http;

	return new Promise((resolve, reject) => {
		// `timeout` only fires on an idle socket, so a server dripping bytes needs a deadline of its own.
		const deadline = setTimeout(() => req.destroy(new Error(`Took too long fetching ${request.url}`)), DEADLINE_MS);
		const settle =
			<T>(fn: (value: T) => void) =>
			(value: T) => {
				clearTimeout(deadline);
				fn(value);
			};
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
					.then(
						settle((bytes: Buffer) =>
							resolve({ url: request.url, status: res.statusCode ?? 0, headers, body: bytes.toString("utf8"), bytes }),
						),
					)
					.catch(settle(reject));
			},
		);
		req.on("timeout", () => req.destroy(new Error(`Timed out fetching ${request.url}`)));
		req.on("error", settle(reject));
		req.end();
	});
}
